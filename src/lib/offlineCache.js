// =============================================================================
// FERZU POS — offlineCache.js
// Helpers para caché offline de Dashboard y Customers en Dexie (IndexedDB)
// =============================================================================

import { db } from './db.js'

// TTL máximo para datos cacheados (en ms) — 24 horas
const MAX_STALE_MS = 24 * 60 * 60 * 1000

// =============================================================================
// Dashboard cache
// =============================================================================

/**
 * Guarda los datos del dashboard en IndexedDB.
 * @param {string} branchId
 * @param {string} range  — 'today' | 'week' | 'month'
 * @param {object} data   — { kpis, salesChart, heatmap, topProducts, stockAlerts, cashSession }
 */
export async function saveDashboardCache(branchId, range, data) {
  try {
    const key = `branch_${branchId}_${range}`
    await db.dashboard_cache.put({
      key,
      data,
      cached_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[offlineCache] saveDashboardCache:', e.message)
  }
}

/**
 * Lee el caché del dashboard desde IndexedDB.
 * Retorna { data, cached_at, isStale } o null si no hay caché.
 */
export async function loadDashboardCache(branchId, range) {
  try {
    const key = `branch_${branchId}_${range}`
    const row = await db.dashboard_cache.get(key)
    if (!row) return null
    const ageMs   = Date.now() - new Date(row.cached_at).getTime()
    const isStale = ageMs > MAX_STALE_MS
    return { data: row.data, cached_at: row.cached_at, isStale }
  } catch {
    return null
  }
}

// =============================================================================
// Customers cache
// =============================================================================

/**
 * Guarda los clientes en IndexedDB.
 */
export async function saveCustomersCache(branchId, customers) {
  try {
    await db.customers_cache.put({
      key: `branch_${branchId}`,
      rows: customers,
      cached_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[offlineCache] saveCustomersCache:', e.message)
  }
}

/**
 * Lee los clientes cacheados. Retorna [] si no hay caché.
 */
export async function loadCustomersCache(branchId) {
  try {
    const row = await db.customers_cache.get(`branch_${branchId}`)
    return row?.rows || []
  } catch {
    return []
  }
}
