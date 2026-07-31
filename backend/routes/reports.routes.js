// =============================================================================
// FERZU POS — Reports Routes  (/api/reports)
// =============================================================================
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth }   from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /reports/dashboard?branch_id=&date=YYYY-MM-DD
router.get('/dashboard', async (req, res) => {
  try {
    const { branch_id, date = new Date().toISOString().split('T')[0] } = req.query;

    if (!branch_id) return res.status(400).json({ error: 'branch_id requerido' });

    const [salesResult, topProductsResult, alertsResult] = await Promise.all([
      // maybeSingle() para no romper cuando no hay ventas (ej: primer día)
      supabaseAdmin.from('v_daily_sales').select('*')
        .eq('branch_id', branch_id).eq('sale_date', date).maybeSingle(),

      // Filtrado por organizationId para evitar leak cross-tenant
      supabaseAdmin.from('v_product_profitability').select('*')
        .eq('organization_id', req.organizationId)
        .order('total_revenue', { ascending: false }).limit(5),

      supabaseAdmin.from('system_alerts').select('*')
        .eq('organization_id', req.organizationId)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false }).limit(10),
    ]);

    res.json({
      today_sales:  salesResult.data || { total_orders: 0, total_revenue: 0, total_tax: 0, sale_date: date },
      top_products: topProductsResult.data || [],
      alerts:       alertsResult.data || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
