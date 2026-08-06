// =============================================================================
// FERZU POS — Analytics Routes
// Tracking de uso por módulo para el dashboard interno del SaaS
// =============================================================================
//   POST /api/analytics/track         → registrar evento de uso
//   GET  /api/analytics/summary       → resumen por módulo (admin interno)
//   GET  /api/analytics/org-summary   → resumen de la org actual
// =============================================================================

import { Router }     from 'express';
import { body }       from 'express-validator';
import { validate }   from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import logger             from '../config/logger.js';

const router = Router();

router.use(requireAuth);

function requireOrg(req, res, next) {
  if (!req.organizationId) return res.status(401).json({ error: 'No autenticado' });
  next();
}

// Módulos válidos para evitar spam en la tabla
const VALID_MODULES = [
  'pos', 'dashboard', 'inventory', 'customers',
  'dian', 'barbershop', 'kitchen', 'workshop',
  'minimarket', 'reports', 'settings', 'modules',
];

const VALID_EVENTS = [
  'module_view',       // usuario navegó al módulo
  'sale_completed',    // venta completada en POS
  'product_created',   // producto creado en inventario
  'product_updated',   // producto editado
  'report_generated',  // reporte generado en dashboard
  'dian_configured',   // DIAN wizard completado
  'session_start',     // inicio de sesión
  'feature_used',      // feature específica usada (ver metadata)
];


// =============================================================================
// POST /api/analytics/track
// Registra un evento de uso. Fire-and-forget desde el frontend.
// Body: { event_type, module, metadata? }
// =============================================================================
router.post('/track', requireOrg, [
  body('event_type').isIn(VALID_EVENTS).withMessage('event_type inválido'),
  body('module').optional().isIn(VALID_MODULES).withMessage('módulo inválido'),
  body('metadata').optional().isObject(),
  validate,
], async (req, res) => {
  // Responder inmediatamente — no bloquear el frontend
  res.json({ received: true });

  // Persistir en background (errores no llegan al usuario)
  try {
    const { event_type, module: mod, metadata } = req.body;
    await supabaseAdmin.from('usage_events').insert({
      organization_id: req.organizationId,
      user_id:         req.userId || null,
      event_type,
      module:          mod     || null,
      metadata:        metadata || null,
    });
  } catch (err) {
    // Silent — analytics no debe romper la experiencia
    logger.warn('[analytics/track] Error persisting event:', err.message);
  }
});


// =============================================================================
// GET /api/analytics/org-summary
// Resumen de uso de la organización actual (últimos 30 días).
// =============================================================================
router.get('/org-summary', requireOrg, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: events } = await supabaseAdmin
      .from('usage_events')
      .select('event_type, module, created_at')
      .eq('organization_id', req.organizationId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    // Agrupar por módulo
    const byModule = {};
    for (const ev of events || []) {
      const key = ev.module || ev.event_type;
      byModule[key] = (byModule[key] || 0) + 1;
    }

    res.json({
      period:   '30d',
      total:    events?.length || 0,
      byModule,
      events:   events?.slice(0, 50) || [], // últimos 50
    });
  } catch (err) {
    logger.error('[analytics/org-summary] Error:', err);
    res.status(500).json({ error: 'Error generando resumen' });
  }
});


// =============================================================================
// GET /api/analytics/summary?days=30
// Dashboard interno FERZU: uso agregado por módulo de todas las orgs.
// Requiere header x-internal-token para acceso.
// =============================================================================
router.get('/summary', async (req, res) => {
  // Proteger endpoint interno con token simple
  // Fail-closed: si ANALYTICS_INTERNAL_TOKEN no está configurado, bloquear acceso.
  const internalToken = process.env.ANALYTICS_INTERNAL_TOKEN;
  if (!internalToken || req.headers['x-internal-token'] !== internalToken) {
    return res.status(403).json({ error: 'Acceso no autorizado' });
  }

  try {
    const days  = Math.min(parseInt(req.query.days) || 30, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: events } = await supabaseAdmin
      .from('usage_events')
      .select('organization_id, event_type, module, created_at')
      .gte('created_at', since);

    // Orgs activas (con al menos 1 evento)
    const activeOrgs = new Set((events || []).map(e => e.organization_id));

    // Eventos por módulo
    const byModule = {};
    const byOrg    = {};
    for (const ev of events || []) {
      const mod = ev.module || ev.event_type;
      byModule[mod] = (byModule[mod] || 0) + 1;
      byOrg[ev.organization_id] = (byOrg[ev.organization_id] || 0) + 1;
    }

    // Top módulos
    const topModules = Object.entries(byModule)
      .sort(([,a], [,b]) => b - a)
      .map(([module, count]) => ({ module, count }));

    // Top orgs (sin exponer datos sensibles — solo ID y conteo)
    const topOrgs = Object.entries(byOrg)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([orgId, count]) => ({ orgId: orgId.slice(0, 8) + '…', count }));

    res.json({
      period:        `${days}d`,
      totalEvents:   events?.length || 0,
      activeOrgs:    activeOrgs.size,
      topModules,
      topOrgs,
    });
  } catch (err) {
    logger.error('[analytics/summary] Error:', err);
    res.status(500).json({ error: 'Error generando resumen' });
  }
});

export default router;
