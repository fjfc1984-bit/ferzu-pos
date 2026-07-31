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
    logger.error('Auth error', { err });
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

/**
 * requireRole(...roles)
 * Middleware factory — verifica que req.user.role esté en la lista permitida.
 * Debe usarse DESPUÉS de requireAuth.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requiere rol: ${roles.join(' o ')}` });
    }
    next();
  };
}
