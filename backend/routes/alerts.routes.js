// =============================================================================
// FERZU POS — Alerts Routes (/api/alerts)
//
//   GET  /api/alerts              → listado paginado con filtros
//   GET  /api/alerts/summary      → conteo por severidad (badge nav)
//   PATCH /api/alerts/:id/resolve → marcar alerta como resuelta
//   PATCH /api/alerts/resolve-all → marcar todas como resueltas
// =============================================================================
import { Router } from 'express';
import { query }  from 'express-validator';
import { validate }       from '../middleware/validate.js';
import { requireAuth }    from '../middleware/auth.js';
import { supabaseAdmin }  from '../config/supabase.js';
import logger             from '../config/logger.js';

const router = Router();
router.use(requireAuth);

// =============================================================================
// GET /api/alerts
// Listado paginado de alertas del sistema con filtros.
//
// Query params:
//   severity   → low | medium | high | critical (opcional)
//   alert_type → cash_discrepancy | stock_anomaly | ... (opcional)
//   resolved   → true | false (default: false)
//   page       → número de página (default: 1)
//   limit      → registros por página (default: 20, max: 100)
// =============================================================================
router.get('/', [
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('alert_type').optional().isString(),
  query('resolved').optional().isIn(['true', 'false']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
], async (req, res) => {
  try {
    const {
      severity,
      alert_type,
      resolved = 'false',
      page     = 1,
      limit    = 20,
    } = req.query;

    const pageNum  = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset   = (pageNum - 1) * limitNum;

    let q = supabaseAdmin
      .from('system_alerts')
      .select('*', { count: 'exact' })
      .eq('organization_id', req.organizationId)
      .eq('is_resolved', resolved === 'true')
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (severity)   q = q.eq('severity',   severity);
    if (alert_type) q = q.eq('alert_type', alert_type);

    const { data: alerts, count, error } = await q;

    if (error) throw error;

    res.json({
      alerts:    alerts || [],
      total:     count  || 0,
      page:      pageNum,
      limit:     limitNum,
      pages:     Math.ceil((count || 0) / limitNum),
    });
  } catch (err) {
    logger.error('[Alerts] GET / error', { err: err.message });
    res.status(500).json({ error: 'Error obteniendo alertas' });
  }
});


// =============================================================================
// GET /api/alerts/summary
// Conteo de alertas NO resueltas por severidad → usado para el badge del nav.
// =============================================================================
router.get('/summary', async (req, res) => {
  try {
    const { data: alerts, error } = await supabaseAdmin
      .from('system_alerts')
      .select('severity')
      .eq('organization_id', req.organizationId)
      .eq('is_resolved', false);

    if (error) throw error;

    const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    for (const a of (alerts || [])) {
      summary.total++;
      if (summary[a.severity] !== undefined) summary[a.severity]++;
    }

    res.json(summary);
  } catch (err) {
    logger.error('[Alerts] GET /summary error', { err: err.message });
    res.status(500).json({ error: 'Error obteniendo resumen de alertas' });
  }
});


// =============================================================================
// PATCH /api/alerts/:id/resolve
// Marca una alerta específica como resuelta.
// =============================================================================
router.patch('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('system_alerts')
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', req.organizationId)  // seguridad: solo la org del usuario
      .select()
      .single();

    if (error) throw error;
    if (!data)  return res.status(404).json({ error: 'Alerta no encontrada' });

    res.json({ success: true, alert: data });
  } catch (err) {
    logger.error('[Alerts] PATCH /:id/resolve error', { err: err.message });
    res.status(500).json({ error: 'Error actualizando alerta' });
  }
});


// =============================================================================
// PATCH /api/alerts/resolve-all
// Marca TODAS las alertas no resueltas de la org como resueltas.
// =============================================================================
router.patch('/resolve-all', async (req, res) => {
  try {
    const { severity, alert_type } = req.body || {};

    let q = supabaseAdmin
      .from('system_alerts')
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq('organization_id', req.organizationId)
      .eq('is_resolved', false);

    if (severity)   q = q.eq('severity',   severity);
    if (alert_type) q = q.eq('alert_type', alert_type);

    const { error, count } = await q;
    if (error) throw error;

    res.json({ success: true, resolved: count ?? 0 });
  } catch (err) {
    logger.error('[Alerts] PATCH /resolve-all error', { err: err.message });
    res.status(500).json({ error: 'Error resolviendo alertas' });
  }
});


export default router;
