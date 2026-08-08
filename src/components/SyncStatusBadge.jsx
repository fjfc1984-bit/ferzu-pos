// =============================================================================
// FERZU POS — SyncStatusBadge
// Badge persistente en esquina inferior derecha.
//
// Comportamiento:
//   severity=ok       → invisible (silencio = todo bien)
//   severity=offline  → badge amarillo ⚡  "Sin conexión"
//   severity=warning  → badge amarillo 🔄  "N en cola"  (animado si isSyncing)
//   severity=critical → badge rojo pulsante ⚠  "N ventas pendientes"
// =============================================================================

import { useSyncQueueStatus } from '../hooks/useSyncQueueStatus'

export default function SyncStatusBadge() {
  const { pendingCount, isOnline, isSyncing, severity } = useSyncQueueStatus()

  // Sin problemas → no renderizar nada
  if (severity === 'ok') return null

  // ── Estilos según severidad ───────────────────────────────────────────────
  const base = 'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-semibold select-none transition-all duration-300'

  const styles = {
    offline:  `${base} bg-amber-500 text-white`,
    warning:  `${base} bg-amber-400 text-amber-900`,
    critical: `${base} bg-red-600 text-white animate-pulse`,
  }

  const icons = {
    offline:  '⚡',
    warning:  isSyncing ? '🔄' : '☁️',
    critical: '⚠️',
  }

  const labels = {
    offline:  'Sin conexión',
    warning:  isSyncing
                ? `Sincronizando ${pendingCount}…`
                : `${pendingCount} en cola`,
    critical: `${pendingCount} ventas pendientes`,
  }

  return (
    <div className={styles[severity]} role="status" aria-live="polite">
      <span aria-hidden="true">{icons[severity]}</span>
      <span>{labels[severity]}</span>
    </div>
  )
}
