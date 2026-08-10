// =============================================================================
// FERZU POS — Middleware de autenticación
// =============================================================================
import { supabaseAdmin, createUserClient } from '../config/supabase.js';
import logger                              from '../config/logger.js';

/**
 * requireAuth
 * Verifica el JWT de Supabase e inyecta en req:
 *   - req.user         → datos del usuario (tabla users)
 *   - req.organizationId → desde nuestra tabla, no del JWT
 *   - req.supabase     → cliente con JWT del usuario (respeta RLS)
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requerido' });

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    // Cargar datos del usuario desde nuestra tabla
    const { data: userData, error: userErr } = await supabaseAdmin
      .from('users')
      .select('*, user_branches(branch_id, is_default)')
      .eq('id', user.id)
      .single();

    if (userErr || !userData) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (!userData.is_active)   return res.status(403).json({ error: 'Usuario inactivo' });

    req.user           = userData;
    req.organizationId = userData.organization_id;  // desde nuestra tabla, nunca del JWT
    req.supabase       = createUserClient(token);    // respeta RLS

    next();
  } catch (err) {
    // Token malformado, red caída o excepción de Supabase → 401, nunca 500
    logger.warn('Auth error (token inválido/expirado)', { message: err.message });
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * requireRole(...roles)
 * Middleware factory — verifica que req.user.role esté en la lista permitida.
 * Debe usarse DESPUÉS de requireAuth.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      // Guardia defensiva: requireRole sin requireAuth previo
      logger.error('requireRole invocado sin req.user — falta requireAuth en la cadena');
      return res.status(500).json({ error: 'Error de configuración del servidor' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requiere rol: ${roles.join(' o ')}` });
    }
    next();
  };
}

/**
 * requirePlanFeature(moduleKey)
 * Middleware factory — verifica que la organización tenga el módulo habilitado.
 * Considera el trial activo como acceso completo.
 * Debe usarse DESPUÉS de requireAuth.
 *
 * Uso: router.post('/chat', requireAuth, requirePlanFeature('ai'), handler)
 *
 * Retorna 402 Payment Required si:
 *   - El trial expiró y el módulo no está en enabled_modules
 *   - El plan no incluye el módulo
 */
export function requirePlanFeature(moduleKey) {
  return async (req, res, next) => {
    if (!req.organizationId) {
      return res.status(401).json({ error: 'Sin organización autenticada' });
    }

    try {
      const { data: org, error } = await supabaseAdmin
        .from('organizations')
        .select('plan_id, enabled_modules, trial_ends_at')
        .eq('id', req.organizationId)
        .single();

      if (error || !org) {
        return res.status(403).json({ error: 'Organización no encontrada' });
      }

      // Trial activo → acceso completo a todos los módulos
      const trialActive = org.trial_ends_at && new Date(org.trial_ends_at) > new Date();
      if (trialActive) return next();

      // Verificar que el módulo esté en enabled_modules
      const enabledModules = org.enabled_modules || [];
      if (enabledModules.includes(moduleKey)) return next();

      // Módulo no disponible en el plan actual
      logger.warn(`[Auth] Módulo '${moduleKey}' bloqueado por plan`, {
        orgId: req.organizationId,
        plan:  org.plan_id,
        moduleKey,
      });

      return res.status(402).json({
        error:            `El módulo '${moduleKey}' no está incluido en tu plan actual`,
        upgrade_required: true,
        module_required:  moduleKey,
        current_plan:     org.plan_id || 'free',
        upgrade_url:      '/pricing',
      });
    } catch (err) {
      logger.error('[Auth] Error verificando plan', { err: err.message });
      return res.status(500).json({ error: 'Error verificando plan' });
    }
  };
}

/**
 * assertBranchOwnership(branchId, organizationId)
 * Verifica que una sucursal pertenece a la organización del usuario.
 * Lanza Error si no pertenece o no existe.
 * Usar dentro de handlers: await assertBranchOwnership(branch_id, req.organizationId)
 */
export async function assertBranchOwnership(branchId, organizationId, { optional = false } = {}) {
  if (!branchId) {
    if (optional) return; // caller declaró explícitamente que branch_id es opcional
    const err = new Error('branch_id es requerido');
    err.status = 400;
    throw err;
  }
  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !data) {
    const err = new Error('Sucursal no autorizada para esta organización');
    err.status = 403;
    throw err;
  }
}

/**
 * requireBranchAccess(getter?)
 * Middleware factory — extrae branch_id y valida ownership.
 * getter: función (req) => branchId. Por defecto lee req.body.branch_id.
 * Para query params: requireBranchAccess(req => req.query.branch_id)
 * Debe usarse DESPUÉS de requireAuth.
 */
export function requireBranchAccess(getter = (req) => req.body.branch_id, { optional = false } = {}) {
  return async (req, res, next) => {
    try {
      const branchId = getter(req);
      await assertBranchOwnership(branchId, req.organizationId, { optional });
      next();
    } catch (err) {
      logger.warn('Branch access denied', { err: err.message, org: req.organizationId });
      res.status(err.status || 403).json({ error: err.message });
    }
  };
}
