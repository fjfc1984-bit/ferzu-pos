// =============================================================================
// FERZU POS — SyncStatusBadge
// Badge persistente en esquina inferior izquierda.
//
// severity=ok       → invisible
// severity=offline  → amarillo ⚡  "Sin conexión"
// severity=warning  → amarillo 🔄  "N en cola"
// severity=critical → rojo pulsante ⚠  "N ventas pendientes"
// severity=dead     → rojo oscuro 🚨  "N venta(s) NO sincronizada(s)"
// =============================================================================

import { useSyncQueueStatus } from '../hooks/useSyncQueueStatus'

export default function SyncStatusBadge() {
  const { pendingCount, failedCount, isOnline, isSyncing, severity } = useSyncQueueStatus()

  if (severity === 'ok') return null

  const base = 'fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-semibold select-none transition-all duration-300'

  const styles = {
    offline:  `${base} bg-amber-500 text-white`,
    warning:  `${base} bg-amber-400 text-amber-900`,
    critical: `${base} bg-red-600 text-white animate-pulse`,
    dead:     `${base} bg-red-800 text-white`,
  }

  const icons = {
    offline:  '⚡',
    warning:  isSyncing ? '🔄' : '☁️',
    critical: '⚠️',
    dead:     '🚨',
  }

  const labels = {
    offline:  'Sin conexión',
    warning:  isSyncing
                ? `Sincronizando ${pendingCount}…`
                : `${pendingCount} en cola`,
    critical: `${pendingCount} ventas pendientes`,
    dead:     `${failedCount} venta${failedCount > 1 ? 's' : ''} NO sincronizada${failedCount > 1 ? 's' : ''}`,
  }

  return (
    <div className={styles[severity]} role="alert" aria-live="assertive">
      <span aria-hidden="true">{icons[severity]}</span>
      <span>{labels[severity]}</span>
    </div>
  )
}
