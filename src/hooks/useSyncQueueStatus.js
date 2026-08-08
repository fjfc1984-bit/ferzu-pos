// =============================================================================
// FERZU POS — useSyncQueueStatus
// Fuente de verdad del estado de sincronización offline.
//
// severity:
//   'ok'       → 0 pendientes + 0 fallidos, con conexión
//   'offline'  → sin conexión
//   'warning'  → con conexión, 1-19 en cola activa
//   'critical' → con conexión, 20+ en cola activa
//   'dead'     → hay ops con status='failed_permanent' (ventas perdidas)
// =============================================================================

import { useSync } from '../context/SyncContext'

export function useSyncQueueStatus() {
  const { pendingCount, failedCount, isOnline, isSyncing } = useSync()

  const severity = !isOnline
    ? 'offline'
    : (failedCount || 0) > 0
      ? 'dead'
      : pendingCount === 0
        ? 'ok'
        : pendingCount >= 20
          ? 'critical'
          : 'warning'

  return {
    pendingCount,             // ops activas en cola (excluye failed_permanent)
    failedCount: failedCount || 0, // ops failed_permanent (ventas no sincronizadas)
    isOnline,
    isSyncing,
    severity,                 // 'ok' | 'offline' | 'warning' | 'critical' | 'dead'
  }
}

export default useSyncQueueStatus
