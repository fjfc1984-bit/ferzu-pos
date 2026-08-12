// =============================================================================
// FERZU POS — Admin Routes  (/api/admin)
// Solo accesible para el super-admin (Fernando).
// Usa supabaseAdmin para cruzar datos entre organizaciones.
// =============================================================================
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth }   from '../middleware/auth.js';
import logger            from '../config/logger.js';

const router = express.Router();

// ── Middleware: solo el super-admin puede acceder ────────────────────────────
// ADMIN_EMAIL debe estar definido en Railway → Settings → Variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  logger.warn('[Admin] ADMIN_EMAIL no definido — endpoint /api/admin bloqueado para todos');
}

function requireSuperAdmin(req, res, next) {
  if (!ADMIN_EMAIL || req.user?.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Acceso restringido' });
  }
  next();
}

// ── GET /api/admin/users — resumen de todos los usuarios registrados ─────────
router.get('/users', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // Traer todas las organizaciones con su owner y métricas
    const { data: orgs, error } = await supabaseAdmin
      .from('organizations')
      .select(`
        id, business_name, business_type, email, plan_id, created_at,
        users!inner(id, full_name, email, role, last_login_at, created_at)
      `)
      .eq('users.role', 'owner')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const orgIds = orgs.map(o => o.id);

    // Traer branches de TODAS las orgs en una sola query (evita N+1)
    const { data: allBranches } = await supabaseAdmin
      .from('branches')
      .select('id, organization_id')
      .in('organization_id', orgIds);

    const branchIdsByOrg = {};
    for (const b of allBranches || []) {
      if (!branchIdsByOrg[b.organization_id]) branchIdsByOrg[b.organization_id] = [];
      branchIdsByOrg[b.organization_id].push(b.id);
    }
    const allBranchIds = (allBranches || []).map(b => b.id);

    // Traer métricas globales en 4 queries paralelas (en vez de 4 × N_orgs)
    const [ordersAll, productsAll, cashAll, eventsAll] = await Promise.all([
      supabaseAdmin.from('orders').select('branch_id', { count: 'exact' }).in('branch_id', allBranchIds),
      supabaseAdmin.from('products').select('organization_id', { count: 'exact' }).in('organization_id', orgIds),
      supabaseAdmin.from('cash_sessions').select('branch_id', { count: 'exact' }).in('branch_id', allBranchIds),
      supabaseAdmin.from('usage_events').select('organization_id', { count: 'exact' }).in('organization_id', orgIds),
    ]);

    // Agrupar conteos por org
    const ordersByOrg   = {};
    const cashByOrg     = {};
    const productsByOrg = {};
    const eventsByOrg   = {};
    const branchToOrg   = {};
    for (const b of allBranches || []) branchToOrg[b.id] = b.organization_id;

    for (const r of ordersAll.data   || []) { const o = branchToOrg[r.branch_id];  if (o) ordersByOrg[o]   = (ordersByOrg[o]   || 0) + 1; }
    for (const r of cashAll.data     || []) { const o = branchToOrg[r.branch_id];  if (o) cashByOrg[o]     = (cashByOrg[o]     || 0) + 1; }
    for (const r of productsAll.data || []) { productsByOrg[r.organization_id] = (productsByOrg[r.organization_id] || 0) + 1; }
    for (const r of eventsAll.data   || []) { eventsByOrg[r.organization_id]   = (eventsByOrg[r.organization_id]   || 0) + 1; }

    const results = orgs.map((org) => {
      const owner = org.users?.[0] || {};
      return {
        org_id:        org.id,
        business_name: org.business_name,
        business_type: org.business_type,
        plan_id:       org.plan_id,
        org_email:     org.email,
        reg_date:      org.created_at,
        owner_name:    owner.full_name,
        owner_email:   owner.email,
        last_login_at: owner.last_login_at,
        total_orders:   ordersByOrg[org.id]   || 0,
        total_products: productsByOrg[org.id] || 0,
        total_sessions: cashByOrg[org.id]     || 0,
        total_events:   eventsByOrg[org.id]   || 0,
      };
    });

    res.json({ users: results, total: results.length });
  } catch (err) {
    logger.error('Admin users error', { err });
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

export default router;
