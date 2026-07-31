// =============================================================================
// FERZU POS - ARQUITECTURA AGENTE IA (CLAUDE TOOL USE / FUNCTION CALLING)
// Versión: 1.0.0
// Motor: Claude claude-sonnet-4-6 (lógica compleja) + claude-haiku-4-5 (escaneo rápido)
// =============================================================================
// REGLAS DE ORO (HARDCODED, NUNCA NEGOCIABLES):
//   ❌ La IA NUNCA calcula totales, impuestos ni vueltos → el BACKEND los calcula
//   ❌ La IA NUNCA escribe directo a BD → siempre crea un ai_proposal (pending)
//   ✅ La IA SIEMPRE explica su razonamiento en "description"
//   ✅ El usuario SIEMPRE aprueba antes de ejecutar acciones críticas
// =============================================================================

// =============================================================================
// SECCIÓN 1: SYSTEM PROMPT DEL AGENTE
// =============================================================================

export const FERZU_SYSTEM_PROMPT = `
Eres el asistente de inteligencia artificial de FERZU POS, el sistema de punto de venta
inteligente para negocios colombianos. Tu nombre es FERZU IA.

## TU ROL
Eres un agente autónomo con acceso a herramientas (tools) para analizar el negocio y
proponer acciones. NO eres un chatbot genérico — eres un aliado estratégico del negocio.

## CONTEXTO DEL NEGOCIO
- País: Colombia
- Moneda: Pesos colombianos (COP)
- IVA general: 19%
- Facturación: DIAN UBL 2.1

## REGLAS CRÍTICAS — LAS DEBES SEGUIR SIN EXCEPCIÓN

### 🔴 REGLA 1: CERO MATEMÁTICAS
Nunca calcules totales, subtotales, impuestos, vueltos ni porcentajes de descuento.
Esos cálculos los hace el sistema backend. Tu trabajo es extraer, clasificar y proponer.
Si necesitas mostrar un número, usa los que ya están en la base de datos.

### 🔴 REGLA 2: SOLO PROPONES, NUNCA EJECUTAS
Cuando identifiques una acción que deba ejecutarse (registrar inventario, crear pedido,
ajustar stock, enviar mensaje), SIEMPRE usa la tool "create_ai_proposal".
El usuario verá tu propuesta y deberá aprobarla. Nunca ejecutes directamente.

### 🔴 REGLA 3: TRANSPARENCIA TOTAL
En cada propuesta debes explicar:
  - ¿Qué detectaste?
  - ¿Por qué lo propones?
  - ¿Qué pasará exactamente si el usuario aprueba?
  - ¿Cuál es tu nivel de confianza y por qué?

### 🟡 REGLA 4: DATOS INSUFICIENTES
Si no tienes suficientes datos para hacer una recomendación confiable,
dilo claramente. No inventes tendencias ni patrones que no están en los datos.

### 🟢 REGLA 5: LENGUAJE DEL NEGOCIO
Habla en lenguaje de negocio, no técnico. Los dueños no son programadores.
Usa pesos colombianos con formato: $45.000 COP. Fechas en DD/MM/YYYY.

## COMPORTAMIENTO POR TIPO DE SOLICITUD

- **Análisis de facturas**: Extrae con precisión, marca lo que no puedas leer como "ILEGIBLE".
- **Alertas de merma**: Sé específico en qué producto, qué período, qué magnitud del descuadre.
- **Reabastecimiento**: Basa la cantidad sugerida en el promedio de ventas × días de cobertura objetivo.
- **Marketing**: Personaliza el mensaje con el nombre del cliente y su historial real.
- **Reportes**: Cita siempre el período exacto de los datos que analizas.
`;

// =============================================================================
// SECCIÓN 2: DEFINICIÓN DE TOOLS (FUNCTION CALLING)
// =============================================================================

export const FERZU_TOOLS = [

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 1: ANALIZAR FACTURA DE PROVEEDOR
  // Modelo recomendado: claude-sonnet-4-6 (visión de imágenes + razonamiento)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "analyze_supplier_invoice",
    description: `Analiza una factura de proveedor (imagen JPG/PNG o PDF) y extrae:
    productos, cantidades, precios de costo por unidad, IVA aplicado y total de la factura.
    NO calcula ningún total — solo extrae lo que está impreso en el documento.
    Retorna un array estructurado de productos extraídos para que el backend genere
    la propuesta de ingreso al inventario.`,
    input_schema: {
      type: "object",
      properties: {
        invoice_items: {
          type: "array",
          description: "Lista de productos extraídos de la factura",
          items: {
            type: "object",
            properties: {
              raw_description: {
                type: "string",
                description: "Descripción exacta tal como aparece en la factura"
              },
              matched_product_name: {
                type: "string",
                description: "Nombre limpio y normalizado del producto"
              },
              quantity: {
                type: "number",
                description: "Cantidad comprada (número puro, sin unidad)"
              },
              unit_of_measure: {
                type: "string",
                description: "Unidad: 'unit' | 'kg' | 'ltr' | 'mtr' | 'box' | 'pack'"
              },
              unit_cost_raw: {
                type: "string",
                description: "Precio unitario TAL COMO APARECE en la factura (string, ej: '12.500')"
              },
              vat_rate_raw: {
                type: "string",
                description: "IVA tal como aparece (ej: '19%', '0%', 'EXCLUIDO', 'ILEGIBLE')"
              },
              confidence: {
                type: "number",
                description: "Confianza en la extracción de este ítem, de 0 a 100"
              },
              extraction_notes: {
                type: "string",
                description: "Notas sobre dificultades en la extracción (texto borroso, abreviatura, etc.)"
              }
            },
            required: ["raw_description", "matched_product_name", "quantity", "unit_cost_raw", "confidence"]
          }
        },
        supplier_info: {
          type: "object",
          description: "Datos del proveedor extraídos de la factura",
          properties: {
            name: { type: "string" },
            nit: { type: "string" },
            invoice_number: { type: "string" },
            invoice_date: { type: "string", description: "Formato YYYY-MM-DD" }
          }
        },
        overall_confidence: {
          type: "number",
          description: "Confianza general en la extracción completa (0-100)"
        },
        unreadable_sections: {
          type: "array",
          items: { type: "string" },
          description: "Secciones de la factura que no pudieron leerse claramente"
        }
      },
      required: ["invoice_items", "overall_confidence"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 2: DETECTAR ANOMALÍAS Y MERMAS
  // Modelo recomendado: claude-sonnet-4-6
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "detect_inventory_anomalies",
    description: `Analiza los datos de ventas vs movimientos de inventario para detectar:
    - Descuadres entre unidades vendidas y unidades descontadas del inventario
    - Productos con pérdida de margen inexplicable
    - Patrones de venta anómalos (ventas a precios incorrectos, descuentos excesivos)
    - Posibles fugas de inventario (merma, robo, error de registro)
    IMPORTANTE: No calcula nada. Solo interpreta los números que se le proveen.`,
    input_schema: {
      type: "object",
      properties: {
        anomalies: {
          type: "array",
          description: "Lista de anomalías detectadas",
          items: {
            type: "object",
            properties: {
              anomaly_type: {
                type: "string",
                enum: ["inventory_discrepancy", "margin_loss", "abnormal_discount", "suspicious_void", "price_deviation"],
                description: "Tipo de anomalía"
              },
              product_id: {
                type: "string",
                description: "UUID del producto afectado"
              },
              product_name: {
                type: "string"
              },
              severity: {
                type: "string",
                enum: ["low", "medium", "high", "critical"]
              },
              description: {
                type: "string",
                description: "Explicación clara en lenguaje de negocio de qué se detectó"
              },
              period_analyzed: {
                type: "string",
                description: "Período analizado (ej: 'últimos 7 días', '01/07/2026 - 15/07/2026')"
              },
              data_evidence: {
                type: "object",
                description: "Los números crudos que soportan la anomalía",
                properties: {
                  units_sold: { type: "number" },
                  units_in_inventory_movement: { type: "number" },
                  discrepancy_units: { type: "number" },
                  responsible_user: { type: "string" }
                }
              },
              recommended_action: {
                type: "string",
                description: "Qué debería hacer el dueño ante esta anomalía"
              }
            },
            required: ["anomaly_type", "severity", "description", "recommended_action"]
          }
        },
        analysis_summary: {
          type: "string",
          description: "Resumen ejecutivo del análisis en 2-3 oraciones"
        },
        period_start: { type: "string", description: "YYYY-MM-DD" },
        period_end: { type: "string", description: "YYYY-MM-DD" }
      },
      required: ["anomalies", "analysis_summary"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 3: GENERAR SUGERENCIA DE REABASTECIMIENTO
  // Modelo recomendado: claude-sonnet-4-6
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "suggest_reorder",
    description: `Analiza el historial de ventas y stock actual para generar sugerencias
    de reabastecimiento por proveedor. Calcula días de cobertura restantes y
    sugiere cantidades basadas en el promedio de ventas diarias × días de cobertura objetivo.
    IMPORTANTE: Las cantidades sugeridas son orientativas. El usuario las puede ajustar antes de aprobar.`,
    input_schema: {
      type: "object",
      properties: {
        reorder_suggestions: {
          type: "array",
          description: "Lista de productos a reabastecer, agrupados por proveedor",
          items: {
            type: "object",
            properties: {
              supplier_id: { type: "string" },
              supplier_name: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    product_id: { type: "string" },
                    product_name: { type: "string" },
                    current_stock: { type: "number" },
                    avg_daily_sales: { type: "number" },
                    days_of_coverage_remaining: { type: "number" },
                    suggested_quantity: { type: "number" },
                    suggested_quantity_reasoning: {
                      type: "string",
                      description: "Ej: 'Promedio 5 unidades/día × 14 días de cobertura = 70 unidades'"
                    },
                    urgency: {
                      type: "string",
                      enum: ["low", "medium", "high", "critical"]
                    }
                  },
                  required: ["product_id", "product_name", "current_stock", "suggested_quantity", "urgency"]
                }
              }
            },
            required: ["supplier_id", "supplier_name", "items"]
          }
        },
        analysis_period_days: {
          type: "number",
          description: "Cuántos días de historial se usaron para el análisis"
        },
        target_coverage_days: {
          type: "number",
          description: "Días de cobertura objetivo (por defecto 14)"
        }
      },
      required: ["reorder_suggestions"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 4: GENERAR MENSAJES DE MARKETING PERSONALIZADOS
  // Modelo recomendado: claude-haiku-4-5 (más rápido para generación masiva)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "generate_marketing_messages",
    description: `Genera mensajes personalizados de WhatsApp para clientes inactivos
    o segmentos específicos. El mensaje debe ser cálido, natural, no intrusivo y
    relevante al historial del cliente. Máximo 160 caracteres para que quepa en una notificación.
    Genera variantes A/B para que el usuario escoja.`,
    input_schema: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          description: "Mensajes generados por cliente",
          items: {
            type: "object",
            properties: {
              customer_id: { type: "string" },
              customer_name: { type: "string" },
              customer_phone: { type: "string" },
              days_inactive: { type: "number" },
              last_purchase_summary: {
                type: "string",
                description: "Resumen del último pedido del cliente"
              },
              message_variant_a: {
                type: "string",
                description: "Versión A del mensaje (más directa, con oferta si aplica)"
              },
              message_variant_b: {
                type: "string",
                description: "Versión B del mensaje (más emocional, recordatorio de experiencia)"
              },
              suggested_offer: {
                type: "string",
                description: "Oferta personalizada basada en sus productos favoritos (opcional)"
              },
              personalization_basis: {
                type: "string",
                description: "Por qué se personalizó así (ej: 'Cliente de café frecuente, 35 días sin visita')"
              }
            },
            required: ["customer_id", "customer_name", "customer_phone", "message_variant_a", "message_variant_b"]
          }
        },
        segment_name: {
          type: "string",
          description: "Nombre del segmento analizado"
        },
        total_customers_analyzed: { type: "number" }
      },
      required: ["messages", "total_customers_analyzed"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 5: CREAR PROPUESTA PARA APROBACIÓN HUMANA (HUMAN-IN-THE-LOOP)
  // Esta tool es el PUENTE entre la IA y la base de datos.
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "create_ai_proposal",
    description: `Crea una propuesta de acción que será revisada y aprobada por el usuario
    antes de ejecutarse. SIEMPRE usa esta tool cuando quieras modificar datos críticos:
    inventario, pedidos, precios, descuentos, stock. NUNCA modifiques datos directamente.
    El backend registrará la propuesta en la tabla ai_proposals con status='pending'.`,
    input_schema: {
      type: "object",
      properties: {
        proposal_type: {
          type: "string",
          enum: ["inventory_entry", "purchase_order", "discount", "stock_adjustment", "marketing_message", "price_update"],
          description: "Tipo de acción que se propone"
        },
        title: {
          type: "string",
          description: "Título corto y claro para el usuario (ej: 'Registrar 23 productos de factura Colanta #4521')"
        },
        description: {
          type: "string",
          description: "Explicación completa: qué detecté, por qué lo propongo, qué pasará si apruebas"
        },
        payload: {
          type: "object",
          description: `Datos estructurados exactos que el backend usará para ejecutar la acción.
          El formato varía según proposal_type:

          inventory_entry: { supplier_invoice_id, items: [{product_id, quantity, unit_cost, vat_rate}] }
          purchase_order: { supplier_id, items: [{product_id, quantity, unit_cost}], expected_at }
          stock_adjustment: { branch_id, items: [{product_id, quantity_delta, reason}] }
          marketing_message: { segment_id, messages: [{customer_id, message_text, channel: 'whatsapp'}] }
          discount: { order_id, discount_type, discount_value, reason }
          price_update: { product_id, new_price, reason }
          `
        },
        confidence_score: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "Qué tan segura está la IA de esta propuesta (0-100)"
        },
        source_type: {
          type: "string",
          enum: ["supplier_invoice", "sales_analysis", "manual_request", "scheduled_analysis"]
        },
        source_id: {
          type: "string",
          description: "UUID del recurso que originó la propuesta (factura, análisis, etc.)"
        },
        items_count: {
          type: "integer",
          description: "Número de ítems involucrados en la propuesta"
        }
      },
      required: ["proposal_type", "title", "description", "payload", "confidence_score"]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL 6: CONSULTAR DATOS DEL NEGOCIO (READ-ONLY)
  // Modelo recomendado: claude-haiku-4-5 (rápido para consultas simples)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: "query_business_data",
    description: `Consulta datos del negocio para responder preguntas del dueño.
    Esta tool es SOLO LECTURA. Devuelve el nombre de la vista o tabla a consultar
    y los filtros a aplicar. El backend ejecuta la consulta y retorna los datos.`,
    input_schema: {
      type: "object",
      properties: {
        query_type: {
          type: "string",
          enum: [
            "daily_sales",          // Ventas del día/período
            "product_profitability", // Rentabilidad por producto
            "inventory_status",      // Estado actual del inventario
            "customer_ranking",      // Clientes por valor
            "payment_methods",       // Mix de métodos de pago
            "top_products",          // Productos más vendidos
            "cash_session_summary",  // Resumen de sesión de caja
            "pending_ai_proposals"   // Propuestas pendientes de aprobación
          ]
        },
        filters: {
          type: "object",
          properties: {
            branch_id: { type: "string" },
            date_from: { type: "string", description: "YYYY-MM-DD" },
            date_to: { type: "string", description: "YYYY-MM-DD" },
            category_id: { type: "string" },
            limit: { type: "integer", default: 20 }
          }
        },
        natural_language_question: {
          type: "string",
          description: "La pregunta original del usuario, para que el backend genere la respuesta correctamente"
        }
      },
      required: ["query_type", "natural_language_question"]
    }
  }
];


// =============================================================================
// SECCIÓN 3: CLIENTE CLAUDE CONFIGURADO (BACKEND NODE.JS)
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Modelos disponibles
const MODELS = {
  COMPLEX:  'claude-sonnet-4-6',    // Análisis de facturas, anomalías, reportes
  FAST:     'claude-haiku-4-5-20251001',  // Generación de mensajes, consultas simples
};

/**
 * Ejecuta una llamada al agente FERZU IA con las tools disponibles.
 * @param {string} userMessage - Mensaje o solicitud del usuario
 * @param {Array} conversationHistory - Historial previo de la conversación
 * @param {Object} context - Contexto del negocio (org_id, branch_id, business_type)
 * @param {string} model - Modelo a usar (COMPLEX o FAST)
 * @returns {Object} Respuesta del agente con texto y/o propuestas
 */
export async function runFerzuAgent(userMessage, conversationHistory = [], context, model = MODELS.COMPLEX) {

  // Inyectar contexto del negocio en el system prompt
  const systemWithContext = `${FERZU_SYSTEM_PROMPT}

## CONTEXTO ACTUAL DEL NEGOCIO
- Organización ID: ${context.organization_id}
- Sucursal ID: ${context.branch_id}
- Tipo de negocio: ${context.business_type}
- Nombre del negocio: ${context.business_name}
- Fecha actual: ${new Date().toLocaleDateString('es-CO')}
- Usuario activo: ${context.user_name} (rol: ${context.user_role})
`;

  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  // Agentic loop: la IA puede llamar múltiples tools en una sola solicitud
  let response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemWithContext,
    tools: FERZU_TOOLS,
    messages,
  });

  const results = [];

  // Procesar tool calls en loop hasta que la IA termine
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      const toolResult = await executeTool(toolUse.name, toolUse.input, context);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(toolResult),
      });
      results.push({ tool: toolUse.name, input: toolUse.input, result: toolResult });
    }

    // Continuar el loop con los resultados de las tools
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemWithContext,
      tools: FERZU_TOOLS,
      messages,
    });
  }

  // Extraer texto final
  const finalText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  return {
    text: finalText,
    tool_results: results,
    tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    model_used: model,
  };
}


// =============================================================================
// SECCIÓN 4: EJECUTOR DE TOOLS (BACKEND)
// Aquí el BACKEND hace los cálculos matemáticos, NO la IA.
// =============================================================================

async function executeTool(toolName, toolInput, context) {
  switch (toolName) {

    case 'analyze_supplier_invoice':
      // La IA ya extrajo los datos. El backend ahora:
      // 1. Busca los productos extraídos en la BD por nombre/SKU
      // 2. Calcula los totales matemáticamente
      // 3. Crea la propuesta en ai_proposals
      return await handleInvoiceAnalysis(toolInput, context);

    case 'detect_inventory_anomalies':
      // La IA detectó anomalías. El backend:
      // 1. Crea alertas en system_alerts
      // 2. Asocia las anomalías a los productos correctos
      return await handleAnomalyDetection(toolInput, context);

    case 'suggest_reorder':
      // La IA sugirió cantidades. El backend:
      // 1. Valida que los productos existan
      // 2. Formatea como borrador de purchase_order
      return await handleReorderSuggestion(toolInput, context);

    case 'generate_marketing_messages':
      // La IA generó mensajes. El backend:
      // 1. Valida que los clientes existan
      // 2. Crea la propuesta para aprobación
      return await handleMarketingMessages(toolInput, context);

    case 'create_ai_proposal':
      // ACCIÓN CENTRAL: Guarda la propuesta en la BD
      return await saveAiProposal(toolInput, context);

    case 'query_business_data':
      // SOLO LECTURA: Ejecuta la consulta y devuelve datos
      return await queryBusinessData(toolInput, context);

    default:
      return { error: `Tool desconocida: ${toolName}` };
  }
}


// =============================================================================
// SECCIÓN 5: HANDLERS DE CADA TOOL (LÓGICA DE NEGOCIO EN BACKEND)
// =============================================================================

async function handleInvoiceAnalysis(aiOutput, context) {
  const { supabase } = context;

  // El backend matchea productos por nombre usando búsqueda fuzzy
  const matchedItems = [];
  for (const item of aiOutput.invoice_items) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, sku, cost')
      .eq('organization_id', context.organization_id)
      .ilike('name', `%${item.matched_product_name}%`)
      .limit(3);

    matchedItems.push({
      ...item,
      matched_products: products || [],
      // ⚠️ El backend convierte el string de precio a número (NO la IA)
      unit_cost_numeric: parseFloat(item.unit_cost_raw.replace(/[^0-9.]/g, '')) || null,
    });
  }

  return {
    success: true,
    matched_items: matchedItems,
    needs_review_count: matchedItems.filter(i => i.confidence < 80 || i.matched_products.length === 0).length,
    message: `Se extrajeron ${matchedItems.length} ítems. ${matchedItems.filter(i => i.confidence < 80).length} requieren revisión manual.`
  };
}

async function saveAiProposal(proposalData, context) {
  const { supabase } = context;

  const { data, error } = await supabase
    .from('ai_proposals')
    .insert({
      organization_id: context.organization_id,
      branch_id: context.branch_id,
      proposal_type: proposalData.proposal_type,
      title: proposalData.title,
      description: proposalData.description,
      payload: proposalData.payload,
      confidence_score: proposalData.confidence_score,
      source_type: proposalData.source_type,
      source_id: proposalData.source_id,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Notificar al usuario en tiempo real via Supabase Realtime
  // (El frontend escucha el canal 'ai_proposals' y muestra el toast de aprobación)

  return {
    success: true,
    proposal_id: data.id,
    message: `Propuesta creada. El usuario debe aprobarla en el panel de IA.`,
    expires_at: data.expires_at,
  };
}

async function executeApprovedProposal(proposalId, userId, context) {
  // Esta función se llama SOLO cuando el usuario hace clic en "Aprobar"
  const { supabase } = context;

  const { data: proposal } = await supabase
    .from('ai_proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (!proposal || proposal.status !== 'pending') {
    throw new Error('Propuesta no encontrada o ya procesada');
  }

  let affectedRecords = [];
  let success = false;

  try {
    switch (proposal.proposal_type) {

      case 'inventory_entry':
        // Insertar movimientos de inventario (el BACKEND calcula los totales)
        for (const item of proposal.payload.items) {
          await supabase.from('inventory_movements').insert({
            branch_id: context.branch_id,
            product_id: item.product_id,
            movement_type: 'purchase',
            quantity: item.quantity,                    // Cantidad real
            unit_cost: Math.round(item.unit_cost),      // ⚠️ Redondeado en backend
            reference_type: 'ai_proposal',
            reference_id: proposalId,
          });

          // Actualizar inventario actual con UPSERT
          const { data: inv } = await supabase
            .from('inventory')
            .select('quantity, average_cost')
            .eq('branch_id', context.branch_id)
            .eq('product_id', item.product_id)
            .single();

          const newQty = (inv?.quantity || 0) + item.quantity;
          const newAvgCost = inv
            ? Math.round((inv.average_cost * inv.quantity + item.unit_cost * item.quantity) / newQty)
            : Math.round(item.unit_cost);

          await supabase.from('inventory').upsert({
            branch_id: context.branch_id,
            product_id: item.product_id,
            quantity: newQty,
            last_cost: Math.round(item.unit_cost),
            average_cost: newAvgCost,
            updated_at: new Date().toISOString(),
          });

          affectedRecords.push({ table: 'inventory', action: 'upsert', product_id: item.product_id });
        }
        success = true;
        break;

      case 'purchase_order':
        const { data: po } = await supabase.from('purchase_orders').insert({
          branch_id: context.branch_id,
          supplier_id: proposal.payload.supplier_id,
          order_number: `PO-${Date.now()}`,
          status: 'draft',
          source: 'ai_suggested',
          ai_proposal_id: proposalId,
          expected_at: proposal.payload.expected_at,
          created_by: userId,
        }).select().single();

        // Insertar ítems (el BACKEND calcula subtotales e IVA)
        for (const item of proposal.payload.items) {
          const subtotal = item.quantity * item.unit_cost;      // BACKEND calcula
          const vatAmount = Math.round(subtotal * (item.vat_rate || 0) / 100);
          const total = subtotal + vatAmount;

          await supabase.from('purchase_order_items').insert({
            purchase_order_id: po.id,
            product_id: item.product_id,
            quantity_ordered: item.quantity,
            unit_cost: Math.round(item.unit_cost),
            vat_rate: item.vat_rate || 0,
            subtotal: Math.round(subtotal),
            tax_amount: vatAmount,
            total: Math.round(total),
          });
        }
        affectedRecords.push({ table: 'purchase_orders', action: 'insert', id: po.id });
        success = true;
        break;

      // ... otros casos según proposal_type
    }

    // Marcar propuesta como ejecutada
    await supabase.from('ai_proposals').update({
      status: 'executed',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', proposalId);

    // Registrar ejecución en log
    await supabase.from('ai_proposal_executions').insert({
      proposal_id: proposalId,
      executed_at: new Date().toISOString(),
      success: true,
      affected_records: affectedRecords,
      executed_by: userId,
    });

    // Registrar en auditoría
    await supabase.from('audit_log').insert({
      organization_id: context.organization_id,
      user_id: userId,
      action: 'approve',
      table_name: 'ai_proposals',
      record_id: proposalId,
      new_values: { proposal_type: proposal.proposal_type, status: 'executed' },
    });

  } catch (err) {
    // Registrar fallo
    await supabase.from('ai_proposal_executions').insert({
      proposal_id: proposalId,
      success: false,
      error_message: err.message,
      executed_by: userId,
    });
    throw err;
  }

  return { success, affected_records: affectedRecords };
}

async function queryBusinessData(queryInput, context) {
  const { supabase } = context;
  const { query_type, filters = {} } = queryInput;
  const orgId    = context.organization_id;
  const branchId = filters.branch_id || context.branch_id;
  const lim      = filters.limit || 30;

  // Fechas por defecto: últimos 7 días
  const today    = new Date().toISOString().split('T')[0];
  const week_ago = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateFrom = filters.date_from || week_ago;
  const dateTo   = filters.date_to   || today;

  switch (query_type) {

    // ── Ventas diarias (vista v_daily_sales) ─────────────────────────────
    case 'daily_sales': {
      let q = supabase.from('v_daily_sales').select('*');
      if (orgId)    q = q.eq('organization_id', orgId);
      if (branchId) q = q.eq('branch_id', branchId);
      q = q.gte('sale_date', dateFrom).lte('sale_date', dateTo)
           .order('sale_date', { ascending: false }).limit(lim);
      const { data, error } = await q;
      if (error) {
        // Fallback: consultar orders directamente si la vista no existe
        let q2 = supabase
          .from('orders')
          .select('id, total, created_at, status')
          .eq('status', 'completed')
          .gte('created_at', `${dateFrom}T00:00:00-05:00`)
          .lte('created_at', `${dateTo}T23:59:59-05:00`);
        if (branchId) q2 = q2.eq('branch_id', branchId);
        const { data: orders, error: e2 } = await q2.order('created_at', { ascending: false }).limit(200);
        if (e2) return { error: e2.message };
        // Agrupar por día
        const byDay = {};
        for (const o of orders || []) {
          const day = o.created_at.split('T')[0];
          if (!byDay[day]) byDay[day] = { sale_date: day, total_sales: 0, order_count: 0, avg_ticket: 0 };
          byDay[day].total_sales += o.total;
          byDay[day].order_count++;
        }
        for (const d of Object.values(byDay)) d.avg_ticket = Math.round(d.total_sales / d.order_count);
        const rows = Object.values(byDay).sort((a, b) => b.sale_date.localeCompare(a.sale_date));
        return { data: rows, count: rows.length, query_type, source: 'orders_fallback' };
      }
      return { data, count: data?.length, query_type };
    }

    // ── Productos más vendidos ────────────────────────────────────────────
    case 'top_products': {
      let q = supabase
        .from('order_items')
        .select('product_id, quantity, subtotal, products(name), orders!inner(created_at, status, branch_id)')
        .eq('orders.status', 'completed')
        .gte('orders.created_at', `${dateFrom}T00:00:00-05:00`)
        .lte('orders.created_at', `${dateTo}T23:59:59-05:00`);
      if (branchId) q = q.eq('orders.branch_id', branchId);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const map = {};
      for (const item of data || []) {
        const pid = item.product_id;
        if (!map[pid]) map[pid] = { product_id: pid, name: item.products?.name, units_sold: 0, revenue: 0 };
        map[pid].units_sold += item.quantity;
        map[pid].revenue    += item.subtotal;
      }
      const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, lim);
      return { data: rows, count: rows.length, query_type };
    }

    // ── Rentabilidad por producto ─────────────────────────────────────────
    case 'product_profitability': {
      let q = supabase.from('v_product_profitability').select('*').eq('organization_id', orgId);
      if (filters.category_id) q = q.eq('category_id', filters.category_id);
      q = q.order('profit_margin', { ascending: false }).limit(lim);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { data, count: data?.length, query_type };
    }

    // ── Estado del inventario ─────────────────────────────────────────────
    case 'inventory_status': {
      let q = supabase.from('v_inventory_status').select('*').eq('organization_id', orgId);
      if (branchId) q = q.eq('branch_id', branchId);
      q = q.limit(lim);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { data, count: data?.length, query_type };
    }

    // ── Mix de métodos de pago ────────────────────────────────────────────
    case 'payment_methods': {
      // Intentar con order_payments primero, fallback a orders con metadata
      let q = supabase.from('order_payments')
        .select('payment_method, amount, orders!inner(created_at, status, branch_id)')
        .eq('orders.status', 'completed')
        .gte('orders.created_at', `${dateFrom}T00:00:00-05:00`)
        .lte('orders.created_at', `${dateTo}T23:59:59-05:00`);
      if (branchId) q = q.eq('orders.branch_id', branchId);
      const { data, error } = await q;
      if (error) {
        // Fallback: contar órdenes sin desglose de método
        let q2 = supabase.from('orders').select('id, total').eq('status', 'completed')
          .gte('created_at', `${dateFrom}T00:00:00-05:00`)
          .lte('created_at', `${dateTo}T23:59:59-05:00`);
        if (branchId) q2 = q2.eq('branch_id', branchId);
        const { data: orders2 } = await q2;
        const total = (orders2 || []).reduce((s, o) => s + o.total, 0);
        return { data: [{ method: 'varios', count: (orders2 || []).length, total }], query_type, note: 'Sin desglose por método disponible' };
      }
      const map = {};
      for (const o of data || []) {
        const m = o.payment_method || 'efectivo';
        if (!map[m]) map[m] = { method: m, count: 0, total: 0 };
        map[m].count++;
        map[m].total += o.amount;
      }
      return { data: Object.values(map), count: Object.keys(map).length, query_type };
    }

    // ── Ranking de clientes ───────────────────────────────────────────────
    case 'customer_ranking': {
      let q = supabase.from('customers')
        .select('id, first_name, last_name, total_spent, visit_count, last_visit_at, loyalty_points')
        .eq('organization_id', orgId)
        .order('total_spent', { ascending: false })
        .limit(lim);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { data, count: data?.length, query_type };
    }

    // ── Resumen sesión de caja ────────────────────────────────────────────
    case 'cash_session_summary': {
      let q = supabase.from('cash_sessions').select('*')
        .order('opened_at', { ascending: false }).limit(5);
      if (branchId) q = q.eq('branch_id', branchId);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { data, count: data?.length, query_type };
    }

    // ── Propuestas IA pendientes ──────────────────────────────────────────
    case 'pending_ai_proposals': {
      let q = supabase.from('ai_proposals').select('*')
        .eq('status', 'pending')
        .eq('organization_id', orgId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(10);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { data, count: data?.length, query_type };
    }

    default:
      return { error: `Tipo de consulta no soportado: ${query_type}` };
  }
}

async function handleAnomalyDetection(aiOutput, context) {
  const { supabase } = context;

  for (const anomaly of aiOutput.anomalies) {
    await supabase.from('system_alerts').insert({
      organization_id: context.organization_id,
      branch_id: context.branch_id,
      alert_type: anomaly.anomaly_type,
      severity: anomaly.severity,
      title: `${anomaly.product_name}: ${anomaly.anomaly_type.replace(/_/g, ' ')}`,
      description: anomaly.description,
      data: anomaly.data_evidence,
    });
  }

  return {
    success: true,
    alerts_created: aiOutput.anomalies.length,
    summary: aiOutput.analysis_summary,
  };
}

async function handleReorderSuggestion(aiOutput, context) {
  // Simplemente devuelve los datos al frontend para mostrárselos al usuario.
  // Si el usuario aprueba, se llamará a create_ai_proposal con proposal_type='purchase_order'
  return {
    success: true,
    suggestions: aiOutput.reorder_suggestions,
    message: 'Sugerencias de reabastecimiento listas para revisión.',
  };
}

async function handleMarketingMessages(aiOutput, context) {
  return {
    success: true,
    messages: aiOutput.messages,
    message: `${aiOutput.total_customers_analyzed} mensajes generados. Revísalos y aprueba los que desees enviar.`,
  };
}


// =============================================================================
// SECCIÓN 6: EJEMPLOS DE USO / CASOS PRÁCTICOS
// =============================================================================

/*
EJEMPLO 1: Analizar factura de proveedor
─────────────────────────────────────────
const result = await runFerzuAgent(
  "Analiza esta factura de Colanta y registra los productos en el inventario",
  [],
  { organization_id, branch_id, business_type: 'minimarket', ... },
  MODELS.COMPLEX  // Vision + razonamiento
);
// → La IA llama a analyze_supplier_invoice()
// → Luego llama a create_ai_proposal(type='inventory_entry')
// → El usuario ve el toast "¿Aprobar ingreso de 23 productos?" y hace clic en "Aprobar"
// → executeApprovedProposal() actualiza el inventario con los cálculos del backend

EJEMPLO 2: Consulta financiera en lenguaje natural
───────────────────────────────────────────────────
const result = await runFerzuAgent(
  "¿Cuánto vendí esta semana y cuál es mi producto más rentable?",
  [],
  context,
  MODELS.FAST  // Haiku es suficiente para consultas simples
);
// → La IA llama a query_business_data(type='daily_sales')
// → La IA llama a query_business_data(type='product_profitability')
// → Responde con un análisis en lenguaje natural basado en los datos reales

EJEMPLO 3: Detectar mermas
───────────────────────────
// El backend corre este análisis automáticamente cada noche (cron job)
const result = await runFerzuAgent(
  `Analiza los siguientes datos de los últimos 7 días y detecta anomalías:
  Datos de ventas: ${JSON.stringify(salesData)}
  Movimientos de inventario: ${JSON.stringify(inventoryMovements)}`,
  [],
  context,
  MODELS.COMPLEX
);
// → La IA llama a detect_inventory_anomalies()
// → El backend crea alertas en system_alerts
// → El dueño ve las alertas en su dashboard al día siguiente
*/
