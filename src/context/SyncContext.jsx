// =============================================================================
// FERZU POS — SyncContext.jsx
// Sincronización offline-first con Dexie (IndexedDB)
//
// Flujo:
//  1. Con internet  → acciones van directo al backend
//  2. Sin internet  → se guardan en Dexie (sync_queue)
//  3. Al volver red → processSyncQueue() sube todo lo pendiente
// =============================================================================

import {
  createContext, useContext, useState, useEffect, useRef, useCallback
} from 'react'
import { db, addToSyncQueue } from '../lib/db'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

const SyncContext = createContext(null)

export function SyncProvider({ children }) {
  const [isOnline,     setIsOnline]     = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount,  setFailedCount]  = useState(0)
  const [isSyncing,    setIsSyncing]    = useState(false)
  const syncRef = useRef(null)

  // ── Monitorear conexión ──────────────────────────────────────────────────
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      toast.success('Conexión restaurada — sincronizando...', { id: 'sync-back' })
      syncRef.current = setTimeout(processSyncQueue, 2000)
    }
    function handleOffline() {
      setIsOnline(false)
      toast('Sin conexión — modo offline activo', {
        id: 'sync-offline',
        icon: '⚡',
        style: { background: '#f59e0b', color: '#1c1917' },
      })
    }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    // F5: registrar Background Sync API (disponible en Chrome/Edge con SW activo)
    // Permite que el SW dispare sync incluso si la pestaña está cerrada al volver red
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.sync.register('ferzu-sync-queue').catch(() => {
          // SyncManager puede fallar en algunos contextos (HTTP, incógnito) — ignorar
        })
      }).catch(() => {})
    }

    // Escuchar mensajes del SW (cuando dispara sync en background)
    function handleSWMessage(event) {
      if (event.data?.type === 'SYNC_COMPLETE') {
        refreshPendingCount()
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleSWMessage)

    refreshPendingCount()
    if (navigator.onLine) syncRef.current = setTimeout(processSyncQueue, 3000)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
      clearTimeout(syncRef.current)
    }
  }, [])

  async function refreshPendingCount() {
    try {
      const all    = await db.sync_queue.toArray()
      const failed = all.filter(op => op.status === 'failed_permanent').length
      const active = all.filter(op => op.status !== 'failed_permanent').length
      setPendingCount(active)
      setFailedCount(failed)
    } catch {
      setPendingCount(0)
      setFailedCount(0)
    }
  }

  // ── Procesar cola ─────────────────────────────────────────────────────────
  const processSyncQueue = useCallback(async () => {
    if (!navigator.onLine) return
    const now = new Date().toISOString()

    // Solo ops activas (no failed_permanent), con retries < 5,
    // y cuyo next_retry_at ya pasó (o no tiene — primera vez)
    const pending = await db.sync_queue
      .filter(op =>
        op.status !== 'failed_permanent' &&
        (op.retries || 0) < 5 &&
        (!op.next_retry_at || op.next_retry_at <= now)
      )
      .toArray()

    if (!pending.length) return

    setIsSyncing(true)
    let ok = 0
    let newDead = 0

    for (const op of pending) {
      try {
        const res = await api.post('/sync/push', { operations: [op] })

        // Verificar si el backend reportó error en el resultado (success: false)
        const opResult = res.data?.results?.[0]
        if (opResult && !opResult.success) {
          throw new Error(opResult.error || 'El servidor rechazó la operación')
        }

        await db.sync_queue.delete(op.id)

        // Marcar offline_orders como synced usando local_id del payload
        const localId = op.payload?.local_id
        if (localId) {
          await db.offline_orders
            .where('local_id').equals(localId)
            .modify({ synced: true, server_id: opResult?.server_id ?? null })
        }
        ok++
      } catch (err) {
        const retries    = (op.retries || 0) + 1
        const lastError  = err.response?.data?.error || err.message || 'Error desconocido'

        if (retries >= 5) {
          // Fallo permanente — marcar y alertar al usuario
          await db.sync_queue.update(op.id, {
            retries,
            status:     'failed_permanent',
            last_error: lastError,
          })
          newDead++
          toast.error(
            `⚠️ Venta no sincronizada: ${lastError.slice(0, 80)}`,
            { id: `dead-${op.id}`, duration: 8000 }
          )
        } else {
          // Backoff exponencial (2^retries seg, máx 5 min)
          const nextRetryAt = new Date(
            Date.now() + Math.min(Math.pow(2, retries) * 1000, 300_000)
          ).toISOString()
          await db.sync_queue.update(op.id, { retries, next_retry_at: nextRetryAt, last_error: lastError })
        }
      }
    }

    setIsSyncing(false)
    await refreshPendingCount()

    if (ok > 0) {
      toast.success(
        `${ok} operación${ok > 1 ? 'es' : ''} sincronizada${ok > 1 ? 's' : ''}`,
        { id: 'sync-done' }
      )
    }
    if (newDead > 0) {
      toast.error(
        `${newDead} venta${newDead > 1 ? 's' : ''} no pudo${newDead > 1 ? 'ieron' : ''} sincronizarse. Revisa en el módulo de Ventas.`,
        { id: 'sync-dead', duration: 10000 }
      )
    }
  }, [])

  // ── Guardar orden offline ─────────────────────────────────────────────────
  const saveOrderOffline = useCallback(async (payload) => {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    await db.offline_orders.add({
      ...payload, local_id: localId,
      created_at: new Date().toISOString(), synced: false,
    })
    await addToSyncQueue('orders', 'INSERT', { ...payload, local_id: localId })
    await refreshPendingCount()
    return localId
  }, [])

  // ── Caché de productos para búsqueda sin internet ─────────────────────────
  const cacheProducts = useCallback(async (products, branchId) => {
    try {
      await db.products.where('branch_id').equals(branchId).delete()
      if (products?.length) {
        await db.products.bulkAdd(products.map(p => ({ ...p, branch_id: branchId })))
      }
    } catch (e) {
      console.warn('[Sync] cacheProducts:', e.message)
    }
  }, [])

  const getOfflineProducts = useCallback(async (branchId, search = '') => {
    try {
      const base = db.products.where('branch_id').equals(branchId)
      if (!search) return await base.toArray()
      const term = search.toLowerCase()
      return await base
        .filter(p =>
          p.name?.toLowerCase().includes(term) ||
          p.sku?.toLowerCase().includes(term)  ||
          p.barcode === search
        )
        .toArray()
    } catch { return [] }
  }, [])

  return (
    <SyncContext.Provider value={{
      isOnline,
      isSyncing,
      pendingCount,
      failedCount,
      saveOrderOffline,
      cacheProducts,
      getOfflineProducts,
      processSyncQueue,
    }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync debe estar dentro de <SyncProvider>')
  return ctx
}

export const useSyncContext = useSync
