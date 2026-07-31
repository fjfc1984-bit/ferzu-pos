// =============================================================================
// FERZU POS — DIAN IA (Facturación Electrónica Inteligente)
// Versión: 1.0.0
// Motor: Claude Haiku (clasificación rápida) + Claude Sonnet (análisis complejo)
// =============================================================================
// REGLAS CRÍTICAS:
//   ❌ La IA NUNCA calcula totales ni impuestos — solo CLASIFICA y VALIDA
//   ✅ Los cálculos matemáticos los hace el backend (routes/orders.routes.js)
//   ✅ La IA devuelve sugerencias; el usuario decide si aplicarlas
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  FAST:    'claude-haiku-4-5-20251001',  // Clasificación, validaciones simples
  COMPLEX: 'claude-sonnet-4-6',          // Análisis de errores DIAN, preflight complejo
};

// =============================================================================
// BASE DE CONOCIMIENTO TRIBUTARIO COLOMBIANO (contexto para la IA)
// Fuente: Estatuto Tributario, E.T. arts 420-512, Ley 2010/2019
// =============================================================================

const COLOMBIA_VAT_KNOWLEDGE = `
## Tarifas de IVA en Colombia (Estatuto Tributario)

### IVA 0% — Excluidos / Exentos (NO cobrar IVA):
- Alimentos de la canasta familiar básica: arroz, papa, yuca, plátano, leche,
  carne de res/cerdo/pollo/pescado (crudos), huevos, panela, aceite vegetal,
  frijoles, lentejas, arveja, maíz, trigo, harina de trigo, pasta, sal,
  frutas y verduras frescas, agua potable envasada (< 50L)
- Medicamentos y productos farmacéuticos (Decreto 2124/92 y listas complementarias)
- Libros, revistas, periódicos
- Servicios educativos (matrícula, pensión)
- Servicios médicos y de hospitalización
- Transporte público terrestre de pasajeros (colectivo)
- Energía eléctrica residencial (primeros 325 kWh/mes estrato 1-2)
- Gas natural residencial
- Dispositivos médicos y ortopédicos (Resolución 8430/93 y listas INVIMA)
- Software (ciertos tipos, art. 476 ET)

### IVA 5% — Tarifa reducida:
- Planes de medicina prepagada y complementarios
- Algunos dispositivos médicos listados por el MinSalud
- Café y cacao sin transformar (pergamino, cereza)
- Motocicletas hasta 200cc
- Computadores y tabletas entre 50-800 UVT

### IVA 19% — Tarifa general (TODO lo que no esté en las listas anteriores):
- Servicios de barbería, peluquería, manicure, estética
- Servicios de taller mecánico (mano de obra + repuestos)
- Productos de aseo y limpieza (jabón, detergente, shampoo)
- Bebidas alcohólicas, cervezas, gaseosas, jugos industriales
- Cigarrillos y tabaco
- Ropa, calzado, accesorios
- Electrodomésticos
- Cosméticos y perfumería
- Papelería y útiles (excepto libros)
- Servicios de restaurante (cuando NO aplica INC)
- Telefonía celular (equipos)
- Repuestos y accesorios de vehículos

### INC — Impuesto Nacional al Consumo (en lugar de IVA):
- Servicios de restaurante y bar (comida para consumo inmediato): 8%
- Servicios de telecomunicaciones (planes de datos/voz): 4%
- Vehículos entre 26-60 UVT: 8% | > 60 UVT: 16%
- Nota: Un negocio que SOLO vende comida para llevar (no para consumo en el lugar)
  puede aplicar IVA 0% en algunos productos básicos en lugar de INC.

### Casos especiales para POS:
- Barbería: servicio → IVA 19% siempre
- Taller mecánico: mano de obra → IVA 19% | repuestos → IVA 19% (generalmente)
- Minimarket: verificar si el producto es de canasta básica (0%) o no (19%)
- Bebidas azucaradas: IVA 19% + posiblemente impuesto saludable adicional
- Producto sin clasificación clara → usar IVA 19% (tarifa residual)
`;

// =============================================================================
// FUNCIÓN 1: CLASIFICAR IVA DE PRODUCTOS
// Usada en: InventoryPage al crear/editar productos
// Input:  array de { name, category, description }
// Output: array de { vatRate, vatCode, confidence, reason, example }
// =============================================================================

/**
 * Clasifica la tarifa de IVA para uno o varios productos.
 * @param {Array<{name: string, category?: string, description?: string}>} products
 * @returns {Promise<Array<{name, vatRate: 0|5|19|8, vatCode: 'IVA'|'INC', confidence: 'high'|'medium'|'low', reason: string, example: string}>>}
 */
export async function classifyProductVAT(products) {
  if (!products || products.length === 0) return [];

  const productList = products.map((p, i) =>
    `${i + 1}. "${p.name}"${p.category ? ` (categoría: ${p.category})` : ''}${p.description ? ` — ${p.description}` : ''}`
  ).join('\n');

  const prompt = `${COLOMBIA_VAT_KNOWLEDGE}

## TU TAREA
Clasifica la tarifa de IVA colombiana para cada producto/servicio de la siguiente lista.
Para cada uno, responde SOLO con JSON válido. No incluyas texto antes ni después del JSON.

## PRODUCTOS A CLASIFICAR:
${productList}

## RESPUESTA REQUERIDA (JSON array, un objeto por producto):
[
  {
    "index": 1,
    "name": "nombre del producto",
    "vatRate": 19,
    "vatCode": "IVA",
    "confidence": "high",
    "reason": "Explicación breve en español (máx 15 palabras)",
    "action": "ninguna | verificar_con_contador | consultar_invima"
  }
]

Valores válidos:
- vatRate: 0, 5, 8, 19
- vatCode: "IVA" (0%, 5%, 19%) o "INC" (8% consumo)
- confidence: "high" (norma clara), "medium" (puede variar), "low" (consultar contador)
- action: "ninguna" | "verificar_con_contador" | "consultar_invima"`;

  const response = await anthropic.messages.create({
    model:      MODELS.FAST,
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();

  // Extraer JSON del response (puede venir con ```json ... ```)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`dianAI.classifyProductVAT: respuesta inesperada de Claude: ${text.substring(0, 200)}`);
  }

  const results = JSON.parse(jsonMatch[0]);

  // Enriquecer con datos del producto original
  return results.map((r, i) => ({
    ...r,
    originalProduct: products[r.index - 1] || products[i],
  }));
}


// =============================================================================
// FUNCIÓN 2: PREFLIGHT — VALIDAR FACTURA ANTES DE ENVIAR A LA DIAN
// Usada en: triggerElectronicInvoice() antes de generar el XML
// Input:  datos completos de la factura (issuer, buyer, items, totals, resolution)
// Output: { isValid, errors, warnings, suggestions }
// =============================================================================

/**
 * Valida una factura electrónica antes de transmitirla a la DIAN.
 * Detecta errores que causarían rechazo, advertencias y mejoras.
 *
 * NOTA: Esta función NO calcula matemáticas — verifica campos, formatos y lógica de negocio.
 *
 * @param {Object} invoiceData - Datos completos de la factura
 * @returns {Promise<{isValid: boolean, errors: string[], warnings: string[], suggestions: string[]}>}
 */
export async function preflightInvoiceCheck(invoiceData) {
  const { issuer, buyer, resolution, invoice, items, totals, environment } = invoiceData;

  // ── Validaciones determinísticas (sin IA, son reglas fijas) ──────────────────
  const errors   = [];
  const warnings = [];
  const suggestions = [];

  // 1. NIT del emisor
  if (!issuer?.nit || !/^\d{7,10}$/.test(issuer.nit)) {
    errors.push(`NIT del emisor inválido: "${issuer?.nit}" — debe ser entre 7 y 10 dígitos`);
  }
  if (issuer?.dv === undefined || issuer?.dv === null) {
    errors.push('Falta el dígito de verificación (DV) del NIT del emisor');
  }

  // 2. Resolución DIAN
  if (!resolution?.number || resolution.number.length < 6) {
    errors.push(`Número de resolución inválido: "${resolution?.number}"`);
  }
  if (!resolution?.prefix) {
    warnings.push('Resolución sin prefijo — las facturas sin prefijo son válidas pero no recomendadas');
  }
  if (resolution?.from && resolution?.to && resolution?.from >= resolution?.to) {
    errors.push(`Rango de numeración inválido: "desde ${resolution.from}" debe ser menor que "hasta ${resolution.to}"`);
  }

  // 3. Fecha de vencimiento de resolución
  if (resolution?.endDate) {
    const expiry    = new Date(resolution.endDate);
    const today     = new Date();
    const diffDays  = Math.ceil((expiry - today) / (86400000));
    if (diffDays < 0)  errors.push(`Resolución DIAN VENCIDA el ${expiry.toLocaleDateString('es-CO')} — NO se puede facturar`);
    else if (diffDays < 7)  warnings.push(`⚠️ CRÍTICO: Resolución vence en ${diffDays} días — tramitar renovación HOY`);
    else if (diffDays < 30) warnings.push(`Resolución vence en ${diffDays} días — iniciar trámite de renovación`);
  }

  // 4. Numeración
  if (!invoice?.number) {
    errors.push('Falta el número de factura');
  }

  // 5. Comprador
  if (!buyer?.docNumber) {
    warnings.push('Comprador sin documento — se usará "222222222222" (consumidor final)');
  }
  if (!buyer?.name) {
    warnings.push('Comprador sin nombre — se usará "Consumidor final"');
  }
  if (buyer?.docType === '31' && !validateNIT(buyer.docNumber)) {
    errors.push(`NIT del comprador "${buyer.docNumber}" inválido — dígito verificador no coincide`);
  }

  // 6. Ítems
  if (!items || items.length === 0) {
    errors.push('La factura no tiene ítems — se requiere al menos uno');
  }
  items?.forEach((item, i) => {
    if (!item.description?.trim()) {
      errors.push(`Ítem #${i + 1}: sin descripción`);
    }
    if (!item.quantity || item.quantity <= 0) {
      errors.push(`Ítem #${i + 1} "${item.description}": cantidad inválida (${item.quantity})`);
    }
    if (item.unitPrice < 0) {
      errors.push(`Ítem #${i + 1} "${item.description}": precio negativo no permitido`);
    }
    if (item.vatRate !== undefined && ![0, 5, 8, 19].includes(Number(item.vatRate))) {
      warnings.push(`Ítem #${i + 1} "${item.description}": tarifa IVA ${item.vatRate}% no estándar — verifica`);
    }
  });

  // 7. Totales
  if (!totals?.grandTotal || totals.grandTotal <= 0) {
    errors.push(`Total de la factura inválido: ${totals?.grandTotal}`);
  }

  // 8. Ambiente
  if (environment === '1') {
    suggestions.push('Ambiente de PRODUCCIÓN — asegúrate de haber completado el proceso de habilitación en el ambiente de pruebas');
  }

  // ── Si hay errores fatales, no llamar a la IA ────────────────────────────────
  if (errors.length > 0) {
    return { isValid: false, errors, warnings, suggestions };
  }

  // ── Validación semántica con IA (solo si los datos básicos son correctos) ────
  try {
    const aiCheck = await anthropic.messages.create({
      model:     MODELS.FAST,
      max_tokens: 512,
      messages:  [{
        role:    'user',
        content: `Eres un experto en facturación electrónica DIAN de Colombia.
Revisa estos datos de factura y detecta problemas semánticos (no matemáticos).

EMISOR: ${issuer?.name} | NIT: ${issuer?.nit} | Régimen: ${issuer?.regimeType}
COMPRADOR: ${buyer?.name} | Doc: ${buyer?.docType} ${buyer?.docNumber}
ÍTEMS: ${items?.map(i => `"${i.description}" x${i.quantity} IVA:${i.vatRate}%`).join(' | ')}
RESOLUCIÓN: ${resolution?.number} | Prefijo: ${resolution?.prefix} | Rango: ${resolution?.from}-${resolution?.to}
AMBIENTE: ${environment === '1' ? 'PRODUCCIÓN' : 'PRUEBAS'}

Responde SOLO con JSON (sin texto adicional):
{
  "semantic_warnings": ["advertencia 1 en español", ...],
  "semantic_suggestions": ["sugerencia 1 en español", ...]
}

Si no encuentras problemas, responde: {"semantic_warnings": [], "semantic_suggestions": []}`,
      }],
    });

    const aiText  = aiCheck.content[0].text.trim();
    const aiMatch = aiText.match(/\{[\s\S]*\}/);
    if (aiMatch) {
      const aiResult = JSON.parse(aiMatch[0]);
      warnings.push(...(aiResult.semantic_warnings || []));
      suggestions.push(...(aiResult.semantic_suggestions || []));
    }
  } catch (aiErr) {
    // Si la IA falla, no bloquear la factura — solo loggear
    console.warn('[dianAI.preflight] Validación semántica IA fallida (no bloqueante):', aiErr.message);
  }

  return {
    isValid:     errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}


// =============================================================================
// FUNCIÓN 3: EXPLICAR ERRORES DIAN EN ESPAÑOL CLARO
// Usada en: cuando la DIAN rechaza una factura (dian_status = 'rejected')
// Input:  array de errores crudos del PTA / DIAN
// Output: explicaciones en español con pasos de acción
// =============================================================================

/**
 * Transforma los errores técnicos de la DIAN en explicaciones claras con pasos de acción.
 * @param {Array<{code?: string, message?: string}>} dianErrors
 * @param {string} invoiceNumber - Número de factura para contexto
 * @returns {Promise<Array<{code, original, explanation, action, severity}>>}
 */
export async function explainDianError(dianErrors, invoiceNumber = '') {
  if (!dianErrors || dianErrors.length === 0) return [];

  const errorList = dianErrors.map((e, i) =>
    `${i + 1}. Código: ${e.code || 'N/A'} | Mensaje: ${e.message || JSON.stringify(e)}`
  ).join('\n');

  const response = await anthropic.messages.create({
    model:     MODELS.COMPLEX,
    max_tokens: 1024,
    messages:  [{
      role:    'user',
      content: `Eres un experto en facturación electrónica DIAN de Colombia (Resolución 0042/2020, Anexo Técnico 1.9).
Traduce estos errores técnicos en explicaciones claras para el dueño de un negocio.

FACTURA: ${invoiceNumber || 'N/A'}

ERRORES DE LA DIAN:
${errorList}

Responde SOLO con JSON (sin texto adicional):
[
  {
    "code": "código del error o N/A",
    "original": "mensaje original",
    "explanation": "Qué significa este error en palabras simples (máx 30 palabras)",
    "action": "Qué debe hacer el negocio para corregirlo (pasos concretos, máx 40 palabras)",
    "severity": "bloqueante | corregible | informativo",
    "contact": "nadie | contador | proveedor_tecnologico | dian"
  }
]`,
    }],
  });

  const text  = response.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    // Fallback: devolver error crudo con explicación genérica
    return dianErrors.map(e => ({
      code:        e.code || 'N/A',
      original:    e.message || JSON.stringify(e),
      explanation: 'Error técnico de la DIAN — consulta con tu proveedor tecnológico.',
      action:      'Contacta a tu proveedor tecnológico (Alegra/Siigo/FacturaTech) con el número de factura y el código de error.',
      severity:    'bloqueante',
      contact:     'proveedor_tecnologico',
    }));
  }

  return JSON.parse(match[0]);
}


// =============================================================================
// FUNCIÓN 4: SUGERIR RÉGIMEN TRIBUTARIO EN ONBOARDING
// Usada en: wizard de configuración DIAN al registrar un negocio nuevo
// Input:  descripción del negocio, ingresos anuales estimados
// Output: recomendación de régimen con razones
// =============================================================================

/**
 * Sugiere el régimen tributario y configuración DIAN correcta para un negocio.
 * @param {Object} params
 * @param {string} params.businessType - Tipo de negocio (barbería, taller, minimarket, restaurante...)
 * @param {number} params.estimatedAnnualRevenue - Ingresos anuales estimados en COP
 * @param {boolean} params.hasEmployees - Si tiene empleados
 * @returns {Promise<{regime, responsability, needsElectronicInvoicing, explanation, nextSteps}>}
 */
export async function suggestTaxRegime({ businessType, estimatedAnnualRevenue, hasEmployees }) {
  // Límite para Régimen Simple 2024: 80.000 UVT × $47.065 UVT = ~$3.765M COP
  const UVT_2024      = 47065;
  const SIMPLE_LIMIT  = 80000 * UVT_2024; // ~$3.765B COP

  // Umbral facturación electrónica obligatoria: prácticamente todos desde 2022
  const FE_THRESHOLD = 0; // Todos los responsables de IVA deben usar FE

  const response = await anthropic.messages.create({
    model:     MODELS.FAST,
    max_tokens: 512,
    messages:  [{
      role:    'user',
      content: `Eres un asesor tributario colombiano. Basado en estos datos, recomienda el régimen tributario correcto.

DATOS DEL NEGOCIO:
- Tipo: ${businessType}
- Ingresos anuales estimados: ${new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0}).format(estimatedAnnualRevenue)}
- Tiene empleados: ${hasEmployees ? 'Sí' : 'No'}
- Límite Régimen Simple 2024: ${new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0}).format(SIMPLE_LIMIT)}

CONTEXTO TRIBUTARIO COLOMBIA 2024:
- No Responsable de IVA (antes simplificado): ingresos < 3.500 UVT (~$164M/año), <= 1 establecimiento, <= 1 empleado, no obligado a llevar contabilidad
- Responsable de IVA (régimen común): debe declarar IVA, expedir facturas electrónicas, llevar contabilidad
- Régimen Simple de Tributación (SIMPLE): alternativa al régimen ordinario, paga tarifa unificada, requiere FE
- Facturación electrónica: OBLIGATORIA para todos los responsables de IVA desde 2022

Responde SOLO con JSON:
{
  "regime": "no_responsable_iva | responsable_iva | regimen_simple",
  "needsElectronicInvoicing": true/false,
  "explanation": "Explicación en 2 oraciones para el dueño del negocio",
  "nextSteps": ["paso 1", "paso 2", "paso 3"],
  "warning": "advertencia importante si aplica, o null"
}`,
    }],
  });

  const text  = response.content[0].text.trim();
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : { regime: 'responsable_iva', needsElectronicInvoicing: true, explanation: 'Consulta con tu contador.', nextSteps: [], warning: null };
}


// =============================================================================
// FUNCIÓN 5: CLASIFICAR LOTE DE PRODUCTOS AL IMPORTAR INVENTARIO
// Usada en: InventoryPage → importar CSV / carga masiva
// Input:  array de productos sin clasificar
// Output: array con vatRate sugerido, con flag si requiere revisión
// =============================================================================

/**
 * Clasifica el IVA de un lote de productos en una sola llamada a la IA.
 * Optimizado para batches grandes (hasta 50 productos).
 * @param {Array<{name, category?, description?}>} products
 * @returns {Promise<Array<{name, vatRate, confidence, needsReview}>>}
 */
export async function batchClassifyVAT(products) {
  if (!products || products.length === 0) return [];

  // Dividir en lotes de 30 para no exceder context
  const BATCH_SIZE = 30;
  const batches    = [];
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    batches.push(products.slice(i, i + BATCH_SIZE));
  }

  const results = [];
  for (const batch of batches) {
    const batchResults = await classifyProductVAT(batch);
    results.push(...batchResults);
  }

  return results.map(r => ({
    name:        r.name,
    vatRate:     r.vatRate,
    vatCode:     r.vatCode,
    confidence:  r.confidence,
    reason:      r.reason,
    needsReview: r.confidence !== 'high' || r.action !== 'ninguna',
  }));
}


// =============================================================================
// HELPERS
// =============================================================================

/**
 * Valida el dígito verificador de un NIT colombiano.
 * Algoritmo oficial DIAN.
 * @param {string|number} nit - NIT sin dígito verificador
 * @returns {boolean}
 */
export function validateNIT(nitWithDV) {
  const nitStr = String(nitWithDV).replace(/[^0-9]/g, '');
  if (nitStr.length < 8) return false;

  const primes   = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
  const digits   = nitStr.split('').map(Number);
  const dv       = digits.pop();
  const reversed = digits.reverse();

  let sum = 0;
  reversed.forEach((d, i) => { sum += d * primes[i]; });

  const remainder = sum % 11;
  const expected  = remainder < 2 ? remainder : 11 - remainder;

  return expected === dv;
}

/**
 * Calcula el dígito verificador de un NIT.
 * @param {string|number} nit - NIT sin dígito verificador
 * @returns {number} Dígito verificador 0-9
 */
export function calculateNITDV(nit) {
  const primes  = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
  const digits  = String(nit).replace(/[^0-9]/g, '').split('').map(Number).reverse();

  let sum = 0;
  digits.forEach((d, i) => { if (primes[i]) sum += d * primes[i]; });

  const remainder = sum % 11;
  return remainder < 2 ? remainder : 11 - remainder;
}
