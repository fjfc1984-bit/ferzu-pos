/**
 * FERZU POS — Indicador de estado offline + ventas pendientes de sincronizar
 *
 * Muestra:
 * - Banner rojo cuando NO hay conexión a internet
 * - Contador de ventas offline pendientes (desde SyncContext / Dexie)
 * - Toast verde cuando se reconecta y sincroniza
 *
 * Montar en AppShell.jsx (siempre visible) o en POSPage.
 */

import { useState, useEffect } from 'react'
import { WifiOff, Wifi, RefreshCw, Clock } from 'lucide-react'

// Leer la cola de Dexie (tabla correcta: sync_queue)
async function getPendingCount() {
  try {
    const { db } = await import('../lib/db.js')
    // sync_queue contiene las operaciones pendientes de subir al backend
    const count = await db.sync_queue.count().catch(() => 0)
    return count
  } catch {
    return 0
  }
}

export function OfflineBanner() {
  const [online,     setOnline]     = useState(navigator.onLine)
  const [pending,    setPending]    = useState(0)
  const [syncing,    setSyncing]    = useState(false)
  const [justSynced, setJustSynced] = useState(false)

  // Detectar cambios de conectividad
  useEffect(() => {
    function goOnline() {
      setOnline(true)
      setJustSynced(true)
      setTimeout(() => setJustSynced(false), 4000)
    }
    function goOffline() { setOnline(false) }

    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Polling de ventas pendientes cada 30s
  useEffect(() => {
    async function check() {
      const count = await getPendingCount()
      setPending(count)
    }
    check()
    const timer = setInterval(check, 30_000)
    return () => clearInterval(timer)
  }, [])

  // Trigger manual de sync
  async function handleSync() {
    setSyncing(true)
    try {
      window.dispatchEvent(new CustomEvent('ferzu:sync-now'))
      await new Promise(r => setTimeout(r, 2000))
      const count = await getPendingCount()
      setPending(count)
    } finally {
      setSyncing(false)
    }
  }

  // Conectado, sin pendientes, sin notificación reciente
  if (online && pending === 0 && !justSynced) return null

  // Recién reconectado y sincronizado
  if (online && justSynced && pending === 0) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium
                        px-4 py-2.5 rounded-full shadow-lg">
          <Wifi className="w-4 h-4" />
          Conexión restaurada · Datos sincronizados
        </div>
      </div>
    )
  }

  // Sin conexión
  if (!online) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-xs
                      font-medium py-1.5 flex items-center justify-center gap-2 shadow-md">
        <WifiOff className="w-3.5 h-3.5" />
        Sin conexión — Las ventas se guardan localmente y se sincronizan cuando vuelva internet
        {pending > 0 && (
          <span className="bg-white/20 px-2 py-0.5 rounded-full ml-1">
            {pending} pendiente{pending !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    )
  }

  // Online pero con pendientes de sync
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="flex items-center gap-2 bg-amber-500 text-white text-sm font-medium
                      px-4 py-2.5 rounded-xl shadow-lg">
        <Clock className="w-4 h-4 shrink-0" />
        <span>
          {pending} venta{pending !== 1 ? 's' : ''} pendiente{pending !== 1 ? 's' : ''} de sincronizar
        </span>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="ml-1 p-1 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
          title="Sincronizar ahora"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  )
}

export default OfflineBanner
