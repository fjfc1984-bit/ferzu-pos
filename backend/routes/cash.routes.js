// =============================================================================
// FERZU POS — Cash Sessions Routes  (/api/cash-sessions)
// =============================================================================
import express  from 'express';
import { body } from 'express-validator';
import { supabaseAdmin } from '../config/supabase.js';
import logger   from '../config/logger.js';
import { requireAuth, requireBranchAccess } from '../middleware/auth.js';
import { validate }    from '../middleware/validate.js';
import { logAudit }    from '../middleware/audit.js';

const router = express.Router();
router.use(requireAuth);

// GET /cash-sessions/current
router.get('/current', async (req, res) => {
  try {
    const branchId = req.headers['x-branch-id'];
    if (!branchId) return res.status(400).json({ error: 'x-branch-id header requerido' });

    const { data, error } = await supabaseAdmin
      .from('cash_sessions')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    res.json(data || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cash-sessions/open
router.post('/open', [
  body('branch_id').isUUID(),
  body('opening_cash').isInt({ min: 0 }),
  validate,
  requireBranchAccess(),  // ✅ valida branch_id pertenece a la org
], async (req, res) => {
  try {
    const { branch_id, opening_cash } = req.body;

    const { data: existing, error: existErr } = await supabaseAdmin
      .from('cash_sessions')
      .select('id')
      .eq('branch_id', branch_id)
      .eq('user_id', req.user.id)
      .eq('status', 'open')
      .maybeSingle();

    if (existErr) throw existErr;
    if (existing) {
      return res.status(409).json({ error: 'Ya tienes una caja abierta', session_id: existing.id });
    }

    const { data, error } = await supabaseAdmin
      .from('cash_sessions')
      .insert({ branch_id, user_id: req.user.id, opening_cash, status: 'open' })
      .select()
      .single();

    if (error) throw error;
    await logAudit(req.organizationId, req.user.id, 'cash_open', 'cash_sessions', data.id, null, { opening_cash });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /cash-sessions/:id/summary — totales de la sesión sin cerrarla
router.get('/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('total, payments(payment_method, amount), discount_amount')
      .eq('cash_session_id', id)
      .eq('status', 'paid');

    const totals = { total_sales: 0, total_cash: 0, total_card: 0, total_nequi: 0, total_daviplata: 0, total_transfers: 0, total_discounts: 0, order_count: 0 };
    for (const order of orders || []) {
      totals.total_sales    += order.total;
      totals.total_discounts += order.discount_amount || 0;
      totals.order_count++;
      for (const p of order.payments || []) {
        if      (p.payment_method === 'cash')          totals.total_cash      += p.amount;
        else if (p.payment_method.startsWith('card'))  totals.total_card      += p.amount;
        else if (p.payment_method === 'nequi')         totals.total_nequi     += p.amount;
        else if (p.payment_method === 'daviplata')     totals.total_daviplata += p.amount;
        else if (p.payment_method === 'transfer')      totals.total_transfers += p.amount;
      }
    }
    res.json(totals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cash-sessions/:id/close
router.post('/:id/close', [
  body('closing_cash').isInt({ min: 0 }),
  validate,
], async (req, res) => {
  try {
    const { id } = req.params;
    const { closing_cash, notes } = req.body;

    // Calcular totales de la sesión en el BACKEND
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('total, payments(payment_method, amount), discount_amount')
      .eq('cash_session_id', id)
      .eq('status', 'paid');

    const totals = {
      total_sales:      0,
      total_cash:       0,
      total_card:       0,
      total_nequi:      0,
      total_daviplata:  0,
      total_transfers:  0,
      total_discounts:  0,
    };

    for (const order of orders || []) {
      totals.total_sales    += order.total;
      totals.total_discounts += order.discount_amount || 0;
      for (const p of order.payments || []) {
        if      (p.payment_method === 'cash')          totals.total_cash       += p.amount;
        else if (p.payment_method.startsWith('card'))  totals.total_card       += p.amount;
        else if (p.payment_method === 'nequi')         totals.total_nequi      += p.amount;
        else if (p.payment_method === 'daviplata')     totals.total_daviplata  += p.amount;
        else if (p.payment_method === 'transfer')      totals.total_transfers  += p.amount;
      }
    }

    const cash_difference = closing_cash - totals.total_cash;

    const { data, error } = await supabaseAdmin
      .from('cash_sessions')
      .update({
        ...totals,
        closing_cash,
        cash_difference,
        closed_at: new Date().toISOString(),
        status:    'closed',
        notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Alerta si hay descuadre > $5.000 COP
    if (Math.abs(cash_difference) > 5000) {
      await supabaseAdmin.from('system_alerts').insert({
        organization_id: req.organizationId,
        alert_type:      'cash_discrepancy',
        severity:        Math.abs(cash_difference) > 50000 ? 'high' : 'medium',
        title:           `Descuadre de caja: ${cash_difference > 0 ? '+' : ''}$${cash_difference.toLocaleString('es-CO')} COP`,
        description:     `Sesión ${id}. Cajero: ${req.user.full_name}`,
        data:            { session_id: id, difference: cash_difference },
      });
    }

    await logAudit(req.organizationId, req.user.id, 'cash_close', 'cash_sessions', id, null, { closing_cash, cash_difference });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
