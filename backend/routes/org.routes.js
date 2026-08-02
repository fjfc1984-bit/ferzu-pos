// =============================================================================
// FERZU POS — Org Routes  (/api/org)
// Gestión de configuración de la organización: módulos activos, perfil
// =============================================================================
import express          from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../config/logger.js';
import { requireAuth }   from '../middleware/auth.js';

const router = express.Router();

// Módulo que nunca puede desactivarse
const CORE_MODULES = ['pos'];

// =============================================================================
// GET /api/org/modules
// Retorna plan_id, enabled_modules y active_modules de la org autenticada
// =============================================================================
router.get('/modules', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('plan_id, enabled_modules, active_modules')
      .eq('id', req.organizationId)
      .single();

    if (error) throw error;
    res.json({
      plan_id:         data.plan_id         || 'free',
      enabled_modules: data.enabled_modules || ['pos'],
      active_modules:  data.active_modules  || {},
    });
  } catch (err) {
    logger.error({ err }, 'GET /org/modules error');
    res.status(500).json({ error: err.message });
  }
});


// =============================================================================
// PATCH /api/org/modules
// Actualiza active_modules — solo admin/owner
// Body: { active_modules: { "dian": false, "customers": true } }
// =============================================================================
router.patch('/modules', requireAuth, async (req, res) => {
  try {
    // Verificar rol admin/owner
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', req.userId)
      .single();

    if (userErr || !user) {
      return res.status(403).json({ error: 'Usuario no encontrado' });
    }
    if (!['admin', 'owner'].includes(user.role)) {
      return res.status(403).json({ error: 'Solo el administrador puede modificar módulos' });
    }

    const { active_modules } = req.body;
    if (!active_modules || typeof active_modules !== 'object' || Array.isArray(active_modules)) {
      return res.status(400).json({ error: 'active_modules debe ser un objeto JSON' });
    }

    // Verificar que la org tiene los módulos que intenta activar/desactivar
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('enabled_modules')
      .eq('id', req.organizationId)
      .single();

    const enabledByPlan = org?.enabled_modules || ['pos'];

    // FIX: Leer active_modules existente para hacer MERGE, no reemplazar.
    // Sin esto, enviar { "barbershop": false } borraba todos los demás toggles.
    const { data: orgFull } = await supabaseAdmin
      .from('organizations')
      .select('active_modules')
      .eq('id', req.organizationId)
      .single();
    const existing = orgFull?.active_modules || {};

    // Sanitizar: solo permitir cambios en módulos habilitados por el plan
    // y nunca deshabilitar módulos core
    const sanitized = { ...existing };   // partir del estado actual
    for (const [key, val] of Object.entries(active_modules)) {
      if (CORE_MODULES.includes(key)) continue;          // 'pos' siempre activo
      if (!enabledByPlan.includes(key)) continue;        // no puede activar lo que no tiene
      sanitized[key] = Boolean(val);
    }

    const { error: updateErr } = await supabaseAdmin
      .from('organizations')
      .update({ active_modules: sanitized, updated_at: new Date().toISOString() })
      .eq('id', req.organizationId);

    if (updateErr) throw updateErr;

    logger.info({ orgId: req.organizationId, active_modules: sanitized }, 'active_modules actualizado');
    res.json({ success: true, active_modules: sanitized });
  } catch (err) {
    logger.error({ err }, 'PATCH /org/modules error');
    res.status(500).json({ error: err.message });
  }
});


export default router;
