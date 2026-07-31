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

const router = express.Router();
router.use(requireAuth);
router.use(aiRateLimit);

// POST /ai/chat — Conversación con el agente
router.post('/chat', [
  body('message').notEmpty().isLength({ max: 2000 }),
  body('branch_id').optional({ nullable: true }).isUUID(),
  validate,
], async (req, res) => {
  try {
    const { message, branch_id, conversation_history = [], page_context } = req.body;

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, business_type')
      .eq('id', req.organizationId)
      .single();

    const context = {
      organization_id: req.organizationId,
      branch_id:       branch_id || null,
      business_type:   org?.business_type,
      business_name:   org?.name,
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
    logger.error('POST /ai/chat', { err });
    res.status(500).json({ error: 'Error del agente IA. Intenta de nuevo.' });
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

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
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
      .from('ai_proposals').select('*').eq('id', id).single();

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
    }).eq('id', id);

    await logAudit(req.organizationId, req.user.id, 'reject', 'ai_proposals', id, null, { reason });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
