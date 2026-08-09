// =============================================================================
// FERZU POS — AI Routes  (/api/ai)
// =============================================================================
import express  from 'express';
import { body } from 'express-validator';
import { supabaseAdmin }      from '../config/supabase.js';
import logger                 from '../config/logger.js';
import { aiRateLimit }        from '../config/rateLimits.js';
import { requireAuth, requireRole, requirePlanFeature } from '../middleware/auth.js';
import { validate }           from '../middleware/validate.js';
import { logAudit }           from '../middleware/audit.js';
import { runFerzuAgent }      from '../ferzu_claude_tools.js';
import { queryBusinessData } from '../lib/claudeTools.js';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
router.use(requireAuth);
router.use(requirePlanFeature('ai'));  // Bloquea si trial expiró o plan no incluye IA
router.use(aiRateLimit);

// POST /ai/chat — Conversación con el agente
router.post('/chat', [
  body('message').notEmpty().isLength({ max: 2000 }),
  body('branch_id').optional({ nullable: true }).matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  validate,
], async (req, res) => {
  try {
    const { message, branch_id, conversation_history = [], page_context } = req.body;

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('business_name, business_type')
      .eq('id', req.organizationId)
      .single();

    const context = {
      organization_id: req.organizationId,
      branch_id:       branch_id || null,
      business_type:   org?.business_type,
      business_name:   org?.business_name,
      user_name:       req.user.full_name,
      user_role:       req.user.role,
      page_context:    page_context || null,
      supabase:        supabaseAdmin,
    };

    // Guardar historial (tabla puede no existir en instancias nuevas — ignorar error)
    try {
      await supabaseAdmin.from('ai_chat_history').insert({
        organization_id: req.organizationId,
        user_id:         req.user.id,
        role:            'user',
        content:         message,
      });
    } catch (_) {}

    const result = await runFerzuAgent(message, conversation_history, context);

    try {
      await supabaseAdmin.from('ai_chat_history').insert({
        organization_id: req.organizationId,
        user_id:         req.user.id,
        role:            'assistant',
        content:         result.text,
        model:           result.model_used,
        tokens_used:     result.tokens_used,
      });
    } catch (_) {}

    res.json({
      text:              result.text,
      proposals_created: (result.tool_results || []).filter(t => t.tool === 'create_ai_proposal').length,
      tokens_used:       result.tokens_used,
    });
  } catch (err) {
    logger.error('POST /ai/chat', {
      message: err.message,
      status:  err.status,
      stack:   err.stack?.substring(0, 500),
    });
    res.status(500).json({ error: `Error del agente IA: ${err.message}` });
  }
});

// POST /ai/analyze-invoice — Analizar factura de proveedor (imagen o PDF)
router.post('/analyze-invoice', [
  body('invoice_id').isUUID(),
  body('branch_id').isUUID(),
  validate,
], async (req, res) => {
  try {
    const { invoice_id, branch_id } = req.body;

    const { data: invoice } = await supabaseAdmin
      .from('supplier_invoices')
      .select('*, suppliers(name)')
      .eq('id', invoice_id)
      .eq('organization_id', req.organizationId)
      .single();

    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    const { data: fileData } = await supabaseAdmin.storage
      .from('invoices')
      .download(invoice.file_url);

    const base64    = Buffer.from(await fileData.arrayBuffer()).toString('base64');
    const mediaType = invoice.file_type === 'pdf' ? 'application/pdf' : `image/${invoice.file_type}`;

    await supabaseAdmin.from('supplier_invoices')
      .update({ ai_processing_status: 'processing' }).eq('id', invoice_id);

    const prompt = `Analiza esta factura de proveedor${invoice.suppliers ? ' de ' + invoice.suppliers.name : ''}.
    Extrae todos los productos, cantidades, precios unitarios e IVA.
    Luego crea una propuesta de ingreso al inventario para que el usuario la apruebe.`;

    // Usar el import top-level de Anthropic (ya importado al inicio del archivo)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role:    'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text',  text: prompt },
        ],
      }],
    });

    await supabaseAdmin.from('supplier_invoices')
      .update({ ai_processing_status: 'completed' }).eq('id', invoice_id);

    res.json({ success: true, result: response.content[0].text });
  } catch (err) {
    await supabaseAdmin.from('supplier_invoices')
      .update({ ai_processing_status: 'failed' }).eq('id', req.body.invoice_id);
    res.status(500).json({ error: err.message });
  }
});

// GET /ai/proposals — Listar propuestas pendientes
router.get('/proposals', async (req, res) => {
  try {
    const { status = 'pending', branch_id } = req.query;
    let query = req.supabase
      .from('ai_proposals')
      .select('*')
      .eq('status', status)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (branch_id) query = query.eq('branch_id', branch_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ai/proposals/:id/approve
router.post('/proposals/:id/approve', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: proposal } = await supabaseAdmin
      .from('ai_proposals').select('*').eq('id', id).eq('organization_id', req.organizationId).single();

    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (proposal.status !== 'pending') return res.status(409).json({ error: `Propuesta ya ${proposal.status}` });

    if (new Date(proposal.expires_at) < new Date()) {
      await supabaseAdmin.from('ai_proposals').update({ status: 'expired' }).eq('id', id);
      return res.status(410).json({ error: 'Propuesta expirada' });
    }

    const { executeApprovedProposal } = await import('../ferzu_claude_tools.js');
    const context = { organization_id: req.organizationId, branch_id: proposal.branch_id, supabase: supabaseAdmin };
    const result  = await executeApprovedProposal(id, req.user.id, context);

    res.json({ success: true, affected_records: result.affected_records });
  } catch (err) {
    logger.error('POST /ai/proposals/:id/approve', { err });
    res.status(500).json({ error: err.message });
  }
});

// POST /ai/proposals/:id/reject
router.post('/proposals/:id/reject', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { id }     = req.params;
    const { reason } = req.body;

    await supabaseAdmin.from('ai_proposals').update({
      status:       'rejected',
      reviewed_by:  req.user.id,
      reviewed_at:  new Date().toISOString(),
      review_notes: reason,
    }).eq('id', id).eq('organization_id', req.organizationId);

    await logAudit(req.organizationId, req.user.id, 'reject', 'ai_proposals', id, null, { reason });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// POST /ai/business-chat — Asistente financiero rápido (sin tool calling)
// Inyecta snapshot real del negocio en el system prompt y responde con Haiku.
// ROL: cajero solo puede preguntar sobre su sesión de caja activa.
//      dueño/gerente/admin tienen acceso completo al snapshot.
// =============================================================================
const SENSITIVE_ROLES = ['cashier', 'cajero'];

async function buildBusinessSnapshot(orgId, branchId, userRole, supabase) {
  const ctx = { organization_id: orgId, branch_id: branchId, supabase };
  const isCashier = SENSITIVE_ROLES.includes((userRole || '').toLowerCase());

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  // Para cajeros: solo sesión de caja activa
  if (isCashier) {
    const cashSession = await queryBusinessData(
      { query_type: 'cash_session_summary', filters: { branch_id: branchId, limit: 1 }, natural_language_question: 'sesión actual' },
      ctx
    );
    return {
      perfil_usuario: 'Cajero — acceso restringido',
      sesion_caja_activa: cashSession.data?.[0] || null,
    };
  }

  // Para dueño/gerente/admin: snapshot completo en paralelo
  const [ventas, topProductos, caja, inventario] = await Promise.allSettled([
    queryBusinessData({ query_type: 'daily_sales',   filters: { branch_id: branchId, date_from: weekAgo, date_to: today, limit: 7 }, natural_language_question: 'ventas últimos 7 días' }, ctx),
    queryBusinessData({ query_type: 'top_products',  filters: { branch_id: branchId, date_from: weekAgo, date_to: today, limit: 5 }, natural_language_question: 'top 5 productos' }, ctx),
    queryBusinessData({ query_type: 'cash_session_summary', filters: { branch_id: branchId, limit: 3 }, natural_language_question: 'resumen sesiones' }, ctx),
    queryBusinessData({ query_type: 'inventory_status',     filters: { branch_id: branchId, limit: 10 }, natural_language_question: 'inventario bajo' }, ctx),
  ]);

  return {
    periodo_analizado:   `${weekAgo} al ${today}`,
    ventas_ultimos_7d:   ventas.status      === 'fulfilled' ? ventas.value.data      : null,
    top_5_productos:     topProductos.status === 'fulfilled' ? topProductos.value.data : null,
    sesiones_caja:       caja.status        === 'fulfilled' ? caja.value.data         : null,
    inventario_muestra:  inventario.status  === 'fulfilled' ? inventario.value.data   : null,
  };
}

function buildSystemPrompt(org, userRole, snapshot, currentDatetime) {
  const isCashier = SENSITIVE_ROLES.includes((userRole || '').toLowerCase());
  const rolesLabel = {
    owner: 'Dueño', admin: 'Administrador', manager: 'Gerente',
    cashier: 'Cajero', cajero: 'Cajero',
  };

  return `Eres el asistente financiero y operativo de ${org.business_name || 'este negocio'}, asignado exclusivamente a este establecimiento.

<contexto_negocio>
- Negocio: ${org.business_name || 'N/A'}
- Sector: ${org.business_type || 'Restaurante / Comercio'}
- Rol del Usuario interactuando: ${rolesLabel[userRole] || userRole || 'Usuario'}
- Fecha y Hora actual: ${currentDatetime}
</contexto_negocio>

<reglas_estrictas>
1. SEGURIDAD DE ROL: ${isCashier
    ? 'Este usuario es Cajero. SOLO puedes responder preguntas sobre su sesión de caja activa. Si pregunta por ganancias netas, costos, reportes mensuales u otras métricas sensibles, responde: "Esa información requiere permisos de Administrador."'
    : 'Este usuario tiene acceso completo. Puedes responder todas las preguntas sobre el negocio.'}
2. CERO ALUCINACIÓN: Responde ÚNICA Y EXCLUSIVAMENTE basándote en los datos de <datos_del_negocio>. Si el dato no está disponible, responde textualmente: "Esa información no está disponible en el reporte actual."
3. FORMATO: Sé ultra-conciso. Sin saludos ni introducciones largas. Usa viñetas solo si hay más de dos elementos. Usa **negritas** para números importantes.
4. MONEDA: Siempre formato colombiano: $45.000 COP. Fechas en DD/MM/YYYY.
5. PRIVACIDAD: Nunca menciones "FERZU POS" ni ninguna plataforma tecnológica — eres parte interna del sistema del negocio.
</reglas_estrictas>

<datos_del_negocio>
${JSON.stringify(snapshot, null, 2)}
</datos_del_negocio>`;
}

router.post('/business-chat', [
  body('message').notEmpty().isLength({ max: 1000 }),
  body('branch_id').optional({ nullable: true }).isUUID(),
  body('conversation_history').optional().isArray({ max: 20 }),
  validate,
], async (req, res) => {
  try {
    const { message, branch_id, conversation_history = [] } = req.body;
    const branchId = branch_id || req.headers['x-branch-id'] || null;

    // 1. Datos de la organización
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('business_name, business_type')
      .eq('id', req.organizationId)
      .single();

    // 2. Snapshot del negocio (paralelo, resiliente)
    const snapshot = await buildBusinessSnapshot(
      req.organizationId,
      branchId,
      req.user.role,
      supabaseAdmin
    );

    // 3. System prompt con datos inyectados
    const now = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const systemPrompt = buildSystemPrompt(org || {}, req.user.role, snapshot, now);

    // 4. Historial de conversación (máx. 10 turnos para no sobrepasar tokens)
    const history = (conversation_history || []).slice(-10);

    // 5. Llamada a Haiku — rápido y barato para Q&A
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response  = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [...history, { role: 'user', content: message }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

    // 6. Guardar en historial (fire-and-forget)
    Promise.resolve(supabaseAdmin.from('ai_chat_history').insert([
      { organization_id: req.organizationId, user_id: req.user.id, role: 'user',      content: message },
      { organization_id: req.organizationId, user_id: req.user.id, role: 'assistant', content: text, model: 'claude-haiku-4-5-20251001', tokens_used: response.usage.input_tokens + response.usage.output_tokens },
    ])).then(() => {}).catch(() => {});

    res.json({
      text,
      tokens_used:    response.usage.input_tokens + response.usage.output_tokens,
      snapshot_keys:  Object.keys(snapshot),
    });
  } catch (err) {
    logger.error('POST /ai/business-chat', {
      message: err.message,
      status:  err.status,
      stack:   err.stack?.substring(0, 500),
    });
    res.status(500).json({ error: `Error del asistente: ${err.message}` });
  }
});

// =============================================================================
// POST /api/ai/copilot/chat — Co-Piloto IA (agente con tools de sistema)
// Igual que /chat pero con system prompt ampliado para modo Co-Piloto:
//   - Proactivo: analiza salud del sistema y alertas de inventario sin que se pida
//   - Operacional: ejecuta flujos con confirmación del usuario
//   - Contextual: adapta las sugerencias al rol y la página actual
// =============================================================================
const COPILOT_SYSTEM_SUFFIX = `

## ROL: CO-PILOTO OPERACIONAL
Eres el Co-Piloto de FERZU POS. No eres un chatbot — eres un agente proactivo.

### COMPORTAMIENTO PROACTIVO
Cuando el usuario abra el chat o salude, SIEMPRE:
1. Llama a get_system_health para verificar si hay problemas de sistema.
2. Llama a get_inventory_alerts con severity_filter='critical_only' para detectar agotados.
3. Si hay problemas, repórtalos PRIMERO antes de responder la pregunta del usuario.
4. Si todo está bien, confírmalo brevemente y responde la pregunta.

### FRASES DE APERTURA PROACTIVA (elige según contexto)
- Si hay sistema degradado: "⚠️ Antes de continuar, detecto [problema]. Te recomiendo [acción]."
- Si hay stock agotado: "📦 Alerta: [N] productos agotados. ¿Quieres que prepare la lista de reabastecimiento?"
- Si todo está ok: "✅ Sistema operando con normalidad. ¿En qué te ayudo?"

### HABILIDADES DE OPERACIÓN DIRECTA (con confirmación obligatoria)
PROTOCOLO ESTRICTO — nunca ejecutar sin confirmar:

**Anular última venta:**
1. Llama void_last_order(dry_run=true) → obtén los detalles
2. Muestra al usuario: total, productos, hace cuántos minutos
3. Espera confirmación EXPLÍCITA ("sí", "confirmo", "anula")
4. Solo entonces llama void_last_order(dry_run=false, order_id=..., reason=...)

**Generar orden de compra:**
1. Si el usuario no especifica proveedor, llama get_inventory_alerts primero para sugerir qué reabastecer.
2. Pregunta al usuario qué proveedor usar (necesitas el supplier_id UUID).
3. Llama generate_purchase_order(dry_run=true, supplier_id, items) → obtén preview con totales.
4. Muestra al usuario: proveedor, productos, cantidades, total.
5. Espera confirmación EXPLÍCITA ("sí", "confirmo", "crea la orden").
6. Solo entonces llama generate_purchase_order(dry_run=false, ...) para crear en BD.

**Abrir sesión de caja:**
1. Pregunta al usuario: ¿cuánto efectivo hay en caja para abrir? (necesitas opening_cash en pesos).
2. Llama open_cash_session(dry_run=true, opening_cash) → verifica si ya hay caja abierta.
3. Si no hay caja abierta: muestra el monto inicial y pide confirmación.
4. Espera confirmación EXPLÍCITA ("sí", "confirmo", "abre la caja").
5. Solo entonces llama open_cash_session(dry_run=false, opening_cash).

**Cerrar sesión de caja:**
1. Llama close_cash_session(dry_run=true) → obtén resumen del turno (ventas por método de pago).
2. Muestra al usuario el resumen completo: total ventas, efectivo esperado, otros métodos de pago.
3. Pregunta: ¿cuánto efectivo tienes físicamente en caja ahora?
4. Espera que el usuario indique el monto contado (closing_cash).
5. Muestra el posible descuadre y espera confirmación EXPLÍCITA.
6. Solo entonces llama close_cash_session(dry_run=false, closing_cash).

**Aplicar descuento a la orden actual:**
1. Llama apply_discount(dry_run=true, discount_type, discount_value) → preview con total original y nuevo total.
2. Muestra: total original, descuento aplicado (monto o %), nuevo total.
3. Espera confirmación EXPLÍCITA ("sí", "confirmo", "aplica el descuento").
4. Solo entonces llama apply_discount(dry_run=false, ...).
- Si el usuario dice "10% de descuento" → discount_type='percentage', discount_value=10.
- Si el usuario dice "descuento de $5000" → discount_type='fixed', discount_value=5000.
- Para quitar un descuento: discount_type='fixed', discount_value=0.

**Crear producto rápido en el catálogo:**
1. Pregunta al usuario los datos mínimos: nombre, precio, IVA (si no lo da, usar 19%), y opcionalmente categoría y SKU.
2. Llama create_product(dry_run=true, name, price, vat_rate, ...) → muestra preview con precio al cliente.
3. Muestra: nombre, tipo, precio base, precio con IVA, categoría.
4. Espera confirmación EXPLÍCITA ("sí", "confirmo", "crea el producto").
5. Solo entonces llama create_product(dry_run=false, ...).
- Si el usuario dice "sin IVA" → vat_rate=0. Si dice "con IVA" → vat_rate=19.
- Si menciona categoría por nombre (ej: "en bebidas") → pasar category_name='bebidas'.
- Para servicios (corte, lavado, consulta) → item_type='service', track_inventory=false.

**Transferir stock entre sucursales:**
1. Pregunta: producto, sucursal origen, sucursal destino y cantidad (si no los da en el mensaje).
2. Llama transfer_stock(dry_run=true, product_name, from_branch_name, to_branch_name, quantity) → muestra preview con stock actual y resultante.
3. Muestra: producto, origen, destino, cantidad, stock antes/después en cada sucursal.
4. Espera confirmación EXPLÍCITA ("sí", "confirmo", "haz el traslado").
5. Solo entonces llama transfer_stock(dry_run=false, ...).
- Los nombres de sucursal son fuzzy: "norte", "principal", "bodega" → el sistema busca automáticamente.
- Si el producto no tiene track_inventory=true, informa al usuario que no es posible transferir.

**Otras acciones (ajuste de stock):**
→ Usar create_ai_proposal con el tipo correspondiente.

NUNCA ejecutar dry_run=false en ninguna operación sin haber mostrado el preview y recibido confirmación explícita.

### FORMATO DE RESPUESTA
- Respuestas cortas para preguntas simples (máx 3 líneas)
- Usar **negrita** para números y alertas críticas
- Usar viñetas solo para listas de 3+ ítems
- Siempre terminar con una acción sugerida si hay algo accionable

### COMPORTAMIENTO PROACTIVO — 5 DOLORES CRÍTICOS DEL NEGOCIO
Eres el Co-Piloto de un negocio real. Tu misión es anticiparte a los problemas antes de que el dueño los detecte. En cada conversación, ten en mente estos 5 dolores y actúa sin esperar a que te pregunten:

**1. Inventario ciego entre sucursales**
- Si el contexto es el POS o inventario, y el usuario no ha preguntado: llama get_inventory_alerts() para ver si hay stock crítico.
- Si detectas stock bajo o agotado, muéstralo al inicio: "⚠️ Hay X productos con stock crítico. ¿Quieres ver el detalle o generar una orden de compra?"
- Si hay stock en otra sucursal, sugiere transfer_stock directamente.

**2. Cierre de caja**
- Si la página actual es el POS al final del día, o si el usuario menciona "cerrar", "cuadrar", "caja": ofrece proactivamente iniciar el flujo de close_cash_session.
- Si hay descuadre al cerrar, explica las posibles causas (descuentos, anulaciones, pago mixto) antes de que el usuario pregunte.

**3. Catálogo desactualizado**
- Si el usuario menciona un producto que no existe en el POS, o dice "este producto no está": ofrece inmediatamente crear el producto con create_product.
- No esperes a que descubra cómo hacerlo — di: "¿Quieres que lo agreguemos ahora? Solo dime el nombre, precio e IVA."

**4. Descuentos y anulaciones sin trazabilidad**
- Si el usuario aplica un descuento mayor al 20%, pregunta el motivo antes de confirmar.
- Si detectas una anulación (void_order), registra automáticamente el motivo en el audit log y notifica: "Anulación registrada con trazabilidad. ¿Quieres ver el reporte de anulaciones del día?"

**5. Reportes en tiempo real**
- Si el usuario pregunta "¿cómo voy?", "¿cuánto llevo?", "¿cómo estuvo el día?": responde SIEMPRE con datos reales llamando get_sales_summary(period='today') — nunca con estimaciones.
- Si son más de las 6pm, añade: "¿Quieres el resumen del día para compartir con tu equipo?" y ofrece close_day(send_email=true).

REGLA DE ORO: Un buen Co-Piloto no espera órdenes — anticipa necesidades. Si tienes datos que el dueño debería ver, muéstralos. Si hay una acción que mejoraría el negocio, sugiérela.

### NUEVAS HERRAMIENTAS — PROTOCOLOS DE USO

**get_sales_summary — Consulta de ventas en lenguaje natural:**
- Frases que la activan: "¿cuánto vendí?", "¿cómo van las ventas?", "¿cuánto llevamos hoy/esta semana/este mes?", "¿cómo voy?", "¿cuánto llevo?", "dame las ventas", "¿cómo estuvo el día?".
- Parámetro period: 'today' (defecto), 'yesterday', 'week', 'month'.
- Llama la tool SIEMPRE sin preguntar primero — el usuario quiere datos, no una pregunta.
- Después del resultado, pregunta: "¿Quieres ver el desglose por producto o el resumen completo del día?"
- Ejemplo respuesta: "📊 **Hoy**: $1.250.000 en ventas 📈 +8.3% vs ayer | 47 órdenes | Ticket promedio: $26.595 | Hora pico: 12:00–13:00"

**get_retention_summary — Estado de clientes:**
- Frases que la activan: "¿cuántos clientes tengo?", "¿cómo está la retención?", "clientes dormidos", "¿quién no ha vuelto?", "VIP", "¿hay cumpleaños?", "dame el resumen de clientes".
- Llama la tool con include_birthdays=true y top_dormant=3.
- Si hay cumpleaños HOY → di inmediatamente: "🎂 **¡Hoy cumple años [nombre]!** ¿Quieres que te genere un mensaje de felicitación para WhatsApp?"
- Si hay clientes 'en_riesgo' → sugiere: "Tienes X clientes que no han comprado en 31-60 días. ¿Los contactamos con una oferta de reactivación?"
- Si hay clientes 'dormido' → sugiere: "X clientes dormidos. ¿Quieres ver quiénes son o generar mensajes de reactivación masiva?"

**close_day — Cierre del día y reporte:**
- Frases que la activan: "cierra el día", "genera el reporte del día", "¿cómo terminamos?", "mándame el resumen", "cierre de día", "reporte del día".
- IMPORTANTE: Esta tool NO cierra la sesión de caja. Si el usuario quiere cerrar caja, usa close_cash_session.
- Si el usuario dice "cierra todo" o "cierra el día y la caja" → primero close_day, luego ofrece close_cash_session por separado.
- Pregunta si quiere recibir el resumen por email: "¿Te envío el resumen al correo registrado?"
- Después de ejecutar, muestra el resumen completo del día.

**get_top_products — Productos más vendidos:**
- Frases que la activan: "¿qué producto se vende más?", "¿cuál es el más popular?", "top productos", "¿qué está saliendo bien?", "¿qué vendo más?", "ranking de productos".
- Parámetro period: 'today', 'week' (defecto), 'month'.
- Llama la tool directamente sin preguntar. Usa limit=5 por defecto.
- Después del resultado, sugiere: "¿Quieres que analice por qué estos productos lideran o si necesitan reabastecimiento?"

**get_birthday_alert — Alertas de cumpleaños:**
- Frases que la activan: "¿hay cumpleaños hoy?", "¿quién cumple años?", "cumpleaños de clientes", "¿a quién felicito?".
- También llámala PROACTIVAMENTE al inicio del chat si es entre las 8am y 12pm (hora Colombia) y no se ha revisado hoy.
- Si hay cumpleaños hoy → di: "🎂 [Nombre] cumple años hoy. ¿Quiero que te genere un mensaje de WhatsApp para felicitarle con una promoción especial?"
- Si hay cumpleaños próximos → menciónalos brevemente: "En los próximos 7 días: [nombre] (en X días)."

### FLUJO MATUTINO RECOMENDADO (si el usuario saluda de mañana)
Cuando el usuario abra el Co-Piloto entre 6am y 11am, ejecuta en paralelo:
1. get_system_health() — salud del sistema
2. get_inventory_alerts(severity_filter='critical_only') — stock agotado
3. get_birthday_alert(days_ahead=7) — cumpleaños del día y semana
4. get_sales_summary(period='yesterday') — cómo estuvo ayer

Presenta el resumen en este orden: 1. Alertas críticas (si hay), 2. Cumpleaños de hoy, 3. Resumen de ayer, 4. ¿En qué te ayudo hoy?
`;

router.post('/copilot/chat', [
  body('message').notEmpty().isLength({ max: 2000 }),
  body('branch_id').optional({ nullable: true }).isUUID(),
  body('conversation_history').optional().isArray({ max: 30 }),
  body('page_context').optional().isString(),
  validate,
], async (req, res) => {
  try {
    const { message, branch_id, conversation_history = [], page_context } = req.body;
    const branchId = branch_id || req.headers['x-branch-id'] || null;

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('business_name, business_type, settings')
      .eq('id', req.organizationId)
      .single();

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('full_name, role')
      .eq('id', req.user.id)
      .single();

    const context = {
      organization_id: req.organizationId,
      branch_id:       branchId,
      user_id:         req.user.id,
      business_type:   org?.business_type || 'retail',
      business_name:   org?.business_name || 'Mi Negocio',
      user_name:       user?.full_name    || 'Usuario',
      user_role:       user?.role         || 'staff',
      page_context:    page_context       || 'general',
      supabase:        supabaseAdmin,
    };

    // Inyectar suffix del Co-Piloto en el system prompt vía contexto extra
    const result = await runFerzuAgent(
      message,
      conversation_history,
      { ...context, _copilot_mode: true, _system_suffix: COPILOT_SYSTEM_SUFFIX },
      'claude-sonnet-4-6'
    );

    // Registrar en historial (sin bloquear la respuesta)
    // Promise.resolve() necesario: supabase-js v2 insert() no es Promise real
    Promise.resolve(supabaseAdmin.from('ai_chat_history').insert({
      organization_id: req.organizationId,
      user_id:         req.user.id,
      branch_id:       branchId,
      message,
      response:        result.text,
      tokens_used:     result.tokens_used,
      model_used:      result.model_used,
      tool_calls:      result.tool_results?.length || 0,
      endpoint:        'copilot',
    })).catch(() => {}); // fire-and-forget

    res.json({
      response:      result.text,
      tool_results:  result.tool_results,
      tokens_used:   result.tokens_used,
      model_used:    result.model_used,
    });

  } catch (err) {
    logger.error('POST /ai/copilot/chat', { message: err.message, stack: err.stack?.substring(0, 500) });
    res.status(500).json({ error: `Co-Piloto no disponible: ${err.message}` });
  }
});

export default router;
