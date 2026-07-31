// =============================================================================
// FERZU POS — Inventory Routes  (/api/inventory)
// =============================================================================
import express  from 'express';
import { body } from 'express-validator';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate }  from '../middleware/validate.js';
import { logAudit }  from '../middleware/audit.js';

const router = express.Router();
router.use(requireAuth);

// GET /inventory?branch_id=&status=low_stock|out_of_stock
router.get('/', async (req, res) => {
  try {
    const { branch_id, status } = req.query;
    let query = req.supabase
      .from('v_inventory_status')
      .select('*')
      .order('stock_status', { ascending: true });

    if (branch_id) query = query.eq('branch_id', branch_id);
    if (status)    query = query.eq('stock_status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/adjustment — Ajuste manual (solo owner/admin)
router.post('/adjustment', requireRole('owner', 'admin'), [
  body('branch_id').isUUID(),
  body('product_id').isUUID(),
  body('quantity_delta').isFloat(),
  body('reason').notEmpty(),
  validate,
], async (req, res) => {
  try {
    const { branch_id, product_id, quantity_delta, reason, variant_id } = req.body;

    const { data: inv } = await supabaseAdmin
      .from('inventory')
      .select('quantity')
      .eq('branch_id', branch_id)
      .eq('product_id', product_id)
      .single();

    const newQty = Math.max(0, (inv?.quantity || 0) + quantity_delta);

    await supabaseAdmin.from('inventory').upsert({
      branch_id, product_id, variant_id,
      quantity:   newQty,
      updated_at: new Date().toISOString(),
    });

    await supabaseAdmin.from('inventory_movements').insert({
      branch_id, product_id, variant_id,
      movement_type:  quantity_delta < 0 ? 'waste' : 'adjustment',
      quantity:       quantity_delta,
      notes:          reason,
      reference_type: 'manual',
      created_by:     req.user.id,
    });

    await logAudit(
      req.organizationId, req.user.id,
      'inventory_adjustment', 'inventory', product_id,
      { quantity: inv?.quantity },
      { quantity: newQty, reason }
    );

    res.json({ success: true, previous_qty: inv?.quantity, new_qty: newQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
