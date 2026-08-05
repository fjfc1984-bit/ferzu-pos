// =============================================================================
// FERZU POS — Inventory Routes  (/api/inventory)
// =============================================================================
import express  from 'express';
import { body } from 'express-validator';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, requireRole, assertBranchOwnership, requireBranchAccess } from '../middleware/auth.js';
import { validate }  from '../middleware/validate.js';
import { logAudit }  from '../middleware/audit.js';
import { analyzeInventory } from '../lib/inventoryAI.js';

const router = express.Router();
router.use(requireAuth);

// GET /inventory?branch_id=&status=low_stock|out_of_stock
router.get('/', async (req, res) => {
  try {
    const { branch_id, status } = req.query;
    await assertBranchOwnership(branch_id, req.organizationId, { optional: true });
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

// GET /inventory/insights — Análisis IA de stock: alertas críticas, stock muerto, sobrestock
// Parámetros opcionales: ?branch_id=UUID&skip_ai=true
router.get('/insights', async (req, res) => {
  try {
    const { branch_id, skip_ai } = req.query;
    await assertBranchOwnership(branch_id, req.organizationId, { optional: true });
    const organizationId = req.organizationId;
    const skipAI = skip_ai === 'true';

    // ── 1. Obtener productos activos con stock actual ──────────────────────
    let productsQuery = req.supabase
      .from('products')
      .select(`
        id, name, sku, cost, min_stock,
        inventory!inner(quantity, branch_id)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (branch_id) {
      productsQuery = productsQuery.eq('inventory.branch_id', branch_id);
    }

    const { data: productsRaw, error: prodErr } = await productsQuery;
    if (prodErr) throw prodErr;

    // Aplanar: si un producto tiene stock en varias sucursales, sumar
    const productMap = new Map();
    for (const p of productsRaw || []) {
      if (!productMap.has(p.id)) {
        const totalStock = Array.isArray(p.inventory)
          ? p.inventory.reduce((sum, inv) => sum + (inv.quantity || 0), 0)
          : (p.inventory?.quantity || 0);
        productMap.set(p.id, {
          id:          p.id,
          name:        p.name,
          sku:         p.sku,
          cost_price:  p.cost,
          min_stock:   p.min_stock,
          stock:       totalStock,
        });
      }
    }
    const products = [...productMap.values()];

    if (products.length === 0) {
      return res.json({
        generatedAt: new Date().toISOString(),
        summary:     'No hay productos activos en tu inventario para analizar.',
        stats:       { totalProducts: 0, criticalCount: 0, warningCount: 0, infoCount: 0, deadStockCount: 0, deadStockValue: 0 },
        insights:    [],
      });
    }

    // ── 2. Ventas de los últimos 30 días ──────────────────────────────────
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    let salesQuery = req.supabase
      .from('order_items')
      .select('product_id, quantity, orders!inner(created_at, status, branch_id)')
      .eq('orders.status', 'completed')
      .gte('orders.created_at', since);

    if (branch_id) {
      salesQuery = salesQuery.eq('orders.branch_id', branch_id);
    }

    const { data: salesRaw, error: salesErr } = await salesQuery;
    if (salesErr) throw salesErr;

    // Agregar ventas por product_id → { totalQty, lastSaleDate }
    const salesMap = new Map();
    for (const item of salesRaw || []) {
      const existing = salesMap.get(item.product_id) || { totalQty: 0, lastSaleDate: null };
      existing.totalQty += item.quantity || 0;
      const saleDate = item.orders?.created_at;
      if (saleDate && (!existing.lastSaleDate || saleDate > existing.lastSaleDate)) {
        existing.lastSaleDate = saleDate;
      }
      salesMap.set(item.product_id, existing);
    }

    // ── 3. Analizar con IA ────────────────────────────────────────────────
    const result = await analyzeInventory(products, salesMap, { skipAI });

    res.json(result);

  } catch (err) {
    console.error('[inventory/insights]', err);
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
  requireBranchAccess(),  // ✅ valida branch_id pertenece a la org
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
