// =============================================================================
// FERZU POS — Error Backup System
//
// POST /api/errors — Recibe snapshots de error del frontend (no requiere JWT)
//
// Los handlers de proceso (uncaughtException / unhandledRejection) se registran
// con registerProcessHandlers() y son invocados desde server.js al arrancar.
// =============================================================================
import express from 'express';
import logger  from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

// POST /api/errors — No requiere auth: el frontend puede enviar errores incluso
// sin un usuario autenticado. La seguridad es por rate-limit (generalRateLimit).
router.post('/', async (req, res) => {
  try {
    const {
      errorId, source, message, stack, componentStack,
      url, userAgent, timestamp,
    } = req.body;

    if (!message) return res.status(400).json({ error: 'message requerido' });

    const payload = {
      error_id:        errorId || `fe-${Date.now()}`,
      source:          source || 'frontend',
      message:         String(message).substring(0, 500),
      stack:           stack           ? String(stack).substring(0, 2000)          : null,
      component_stack: componentStack  ? String(componentStack).substring(0, 1000) : null,
      url:             url             ? String(url).substring(0, 300)             : null,
      user_agent:      userAgent       ? String(userAgent).substring(0, 300)       : null,
      occurred_at:     timestamp || new Date().toISOString(),
    };

    // Log inmediato con winston (persiste en logs/error.log en Railway)
    logger.error('[ERROR_BACKUP] Frontend error', payload);

    // Persistir en Supabase si la tabla existe (best-effort)
    try {
      await supabaseAdmin.from('error_logs').insert([payload]);
    } catch (_) { /* tabla puede no existir aún — el log de winston es suficiente */ }

    return res.json({ received: true, errorId: payload.error_id });
  } catch (err) {
    logger.error('[ERROR_BACKUP] Error en endpoint /api/errors', { error: err.message });
    return res.status(500).json({ error: 'Error interno' });
  }
});

// =============================================================================
// Handlers de proceso — se registran una vez al arrancar el servidor
// =============================================================================
export function registerProcessHandlers() {
  process.on('uncaughtException', (err) => {
    logger.error('[PROCESO] uncaughtException — el proceso va a terminar', {
      message: err.message,
      stack:   err.stack?.substring(0, 2000),
      ts:      new Date().toISOString(),
    });
    // Dar 500ms para que Winston vacíe el buffer antes de salir
    setTimeout(() => process.exit(1), 500);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stk = reason instanceof Error ? reason.stack?.substring(0, 2000) : null;
    logger.error('[PROCESO] unhandledRejection — promesa sin .catch()', {
      message: msg,
      stack:   stk,
      ts:      new Date().toISOString(),
    });
    // No matamos el proceso en rejection — solo logueamos
  });
}

export default router;
