// =============================================================================
// FERZU POS — Log de auditoría
// Best-effort: un fallo en auditoría no mata el endpoint.
// =============================================================================
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../config/logger.js';

/**
 * logAudit
 * Registra una acción en la tabla audit_log.
 * No lanza excepciones — si falla, solo loguea un warning.
 */
export async function logAudit(organizationId, userId, action, tableName, recordId, oldValues, newValues) {
  try {
    await supabaseAdmin.from('audit_log').insert({
      organization_id: organizationId,
      user_id:         userId,
      action,
      table_name:      tableName,
      record_id:       recordId,
      old_values:      oldValues,
      new_values:      newValues,
    });
  } catch (e) {
    logger.warn('[logAudit] No se pudo registrar auditoría', {
      action,
      tableName,
      recordId,
      err: e.message,
    });
  }
}
