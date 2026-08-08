// =============================================================================
// FERZU POS — AI Routes  (/api/ai)
// =============================================================================
import express  from 'express';
import { body } from 'express-validator';
import { supabaseAdmin }      from '../config/supabase.js';
import logger                 from '../config/logger.js';
import { aiRateLimit }        from '../config/rateLimits.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate }           from '../middleware/validate.js';
import { logAudit }           from '../middleware/audit.js';
import { runFerzuAgent }      from '../ferzu_claude_tools.js';
import { queryBusinessData } from '../lib/claudeTools.js';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
router.use(requireAuth);
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

**Otras acciones (ajuste de stock, orden de compra):**
→ Usar create_ai_proposal con el tipo correspondiente

NUNCA ejecutar dry_run=false sin haber mostrado el preview y recibido confirmación.

### FORMATO DE RESPUESTA
- Respuestas cortas para preguntas simples (máx 3 líneas)
- Usar **negrita** para números y alertas críticas
- Usar viñetas solo para listas de 3+ ítems
- Siempre terminar con una acción sugerida si hay algo accionable
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
