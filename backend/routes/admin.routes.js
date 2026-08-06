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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'fjfc1984@gmail.com';

function requireSuperAdmin(req, res, next) {
  if (req.user?.email !== ADMIN_EMAIL) {
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

    // Para cada org, traer métricas en paralelo
    const results = await Promise.all(
      orgs.map(async (org) => {
        const [ordersRes, productsRes, cashRes, eventsRes] = await Promise.all([
          // Total órdenes via branches
          supabaseAdmin
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .in('branch_id',
              (await supabaseAdmin.from('branches').select('id').eq('organization_id', org.id))
                .data?.map(b => b.id) || []
            ),

          supabaseAdmin
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', org.id),

          supabaseAdmin
            .from('cash_sessions')
            .select('id', { count: 'exact', head: true })
            .in('branch_id',
              (await supabaseAdmin.from('branches').select('id').eq('organization_id', org.id))
                .data?.map(b => b.id) || []
            ),

          supabaseAdmin
            .from('usage_events')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', org.id),
        ]);

        const owner = org.users?.[0] || {};

        return {
          org_id:        org.id,
          business_name: org.business_name,
          business_type: org.business_type,
          plan_id:       org.plan_id,
          org_email:     org.email,
          reg_date:      org.created_at,
          // Owner
          owner_name:      owner.full_name,
          owner_email:     owner.email,
          last_login_at:   owner.last_login_at,
          // Métricas
          total_orders:    ordersRes.count   || 0,
          total_products:  productsRes.count || 0,
          total_sessions:  cashRes.count     || 0,
          total_events:    eventsRes.count   || 0,
        };
      })
    );

    res.json({ users: results, total: results.length });
  } catch (err) {
    logger.error('Admin users error', { err });
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

export default router;
