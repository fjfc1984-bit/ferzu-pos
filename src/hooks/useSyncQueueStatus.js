// =============================================================================
// FERZU POS — useSyncQueueStatus
// Fuente de verdad del estado de sincronización offline.
//
// Schema Dexie real (src/lib/db.js):
//   sync_queue:     ++id, table_name, operation, payload, created_at, retries
//   offline_orders: ++id, branch_id, created_at, synced, local_id
//
// IMPORTANTE: NO duplica lógica — consume SyncContext que ya gestiona
// db.sync_queue.count() y los eventos online/offline del sistema.
// =============================================================================

import { useSync } from '../context/SyncContext'

/**
 * Retorna el estado completo de la cola de sincronización.
 *
 * Uso:
 *   const { pendingCount, isOnline, isSyncing, severity } = useSyncQueueStatus()
 *
 * severity:
 *   'ok'       → 0 pendientes, con conexión
 *   'offline'  → sin conexión (pendientes o no)
 *   'warning'  → con conexión pero 1-19 ítems en cola (sync en progreso)
 *   'critical' → con conexión pero 20+ ítems en cola (atasco)
 */
export function useSyncQueueStatus() {
  const { pendingCount, isOnline, isSyncing } = useSync()

  const severity = !isOnline
    ? 'offline'
    : pendingCount === 0
      ? 'ok'
      : pendingCount >= 20
        ? 'critical'
        : 'warning'

  return {
    pendingCount,  // número de ítems en sync_queue
    isOnline,      // navigator.onLine (reactivo)
    isSyncing,     // true mientras processSyncQueue() está corriendo
    severity,      // 'ok' | 'offline' | 'warning' | 'critical'
  }
}

export default useSyncQueueStatus
