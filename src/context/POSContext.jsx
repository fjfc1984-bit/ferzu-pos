// =============================================================================
// FERZU POS — POSContext.jsx
// Contexto global del Punto de Venta con reducer completo
// REGLA DE ORO: Todos los cálculos usan Math.round() — sin flotantes
// =============================================================================

import { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { api, cashAPI } from '../lib/api'
import toast        from 'react-hot-toast'
import { useSync }  from './SyncContext'

// ---------------------------------------------------------------------------
// TIPOS DE ACCIÓN
// ---------------------------------------------------------------------------
const A = {
  ADD_ITEM:         'ADD_ITEM',
  REMOVE_ITEM:      'REMOVE_ITEM',
  UPDATE_QTY:       'UPDATE_QTY',
  SET_DISCOUNT:     'SET_DISCOUNT',
  CLEAR_DISCOUNT:   'CLEAR_DISCOUNT',
  SET_CUSTOMER:     'SET_CUSTOMER',
  CLEAR_ORDER:      'CLEAR_ORDER',
  SET_CASH_SESSION: 'SET_CASH_SESSION',
  SET_BRANCH:       'SET_BRANCH',
  SET_PROCESSING:   'SET_PROCESSING',
  SET_LAST_ORDER:   'SET_LAST_ORDER',
}

// ---------------------------------------------------------------------------
// ESTADO INICIAL
// ---------------------------------------------------------------------------
const initialState = {
  items:        [],     // [{ product_id, product_name, product_sku, unit_price, vat_rate, quantity }]
  discount:     null,   // { type: 'pct'|'fixed', value, reason }
  customerId:   null,
  customerName: null,
  cashSession:  null,   // objeto completo de cash_sessions
  branchId:     null,
  isProcessing: false,
  lastOrderId:  null,
}

// ---------------------------------------------------------------------------
// HELPERS MATEMÁTICOS — sin flotantes (REGLA DE ORO)
// ---------------------------------------------------------------------------
function itemSubtotal(unitPrice, qty) {
  return Math.round(unitPrice) * Math.round(qty)
}

function computeTotals(items, discount) {
  let subtotal  = 0
  let tax_total = 0

  for (const item of items) {
    const sub  = itemSubtotal(item.unit_price, item.quantity)
    subtotal  += sub
    if (item.vat_rate > 0) {
      tax_total += Math.round(sub * (item.vat_rate / 100))
    }
  }

  let discount_amount = 0
  if (discount && subtotal > 0) {
    discount_amount = discount.type === 'pct'
      ? Math.round(subtotal * (discount.value / 100))
      : Math.min(Math.round(discount.value), subtotal)
  }

  const total = Math.max(0, subtotal + tax_total - discount_amount)
  return { subtotal, tax_total, discount_amount, total }
}

// ---------------------------------------------------------------------------
// REDUCER
// ---------------------------------------------------------------------------
function posReducer(state, { type, payload }) {
  switch (type) {

    case A.ADD_ITEM: {
      const existing = state.items.find(i => i.product_id === payload.id)
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.product_id === payload.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        }
      }
      return {
        ...state,
        items: [...state.items, {
          product_id:   payload.id,
          product_name: payload.name,
          product_sku:  payload.sku || '',
          unit_price:   Math.round(payload.price),
          vat_rate:     payload.vat_rate ?? 0,
          quantity:     1,
        }],
      }
    }

    case A.REMOVE_ITEM:
      return { ...state, items: state.items.filter(i => i.product_id !== payload) }

    case A.UPDATE_QTY: {
      const { productId, qty } = payload
      if (qty <= 0) return { ...state, items: state.items.filter(i => i.product_id !== productId) }
      return {
        ...state,
        items: state.items.map(i =>
          i.product_id === productId ? { ...i, quantity: Math.round(qty) } : i
        ),
      }
    }

    case A.SET_DISCOUNT:
      return { ...state, discount: payload }

    case A.CLEAR_DISCOUNT:
      return { ...state, discount: null }

    case A.SET_CUSTOMER:
      return {
        ...state,
        customerId:   payload?.id   ?? null,
        customerName: payload?.name ?? null,
      }

    case A.CLEAR_ORDER:
      return {
        ...state,
        items:        [],
        discount:     null,
        customerId:   null,
        customerName: null,
        isProcessing: false,
      }

    case A.SET_CASH_SESSION:
      return { ...state, cashSession: payload }

    case A.SET_BRANCH:
      return { ...state, branchId: payload }

    case A.SET_PROCESSING:
      return { ...state, isProcessing: payload }

    case A.SET_LAST_ORDER:
      return { ...state, lastOrderId: payload }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// CONTEXTO
// ---------------------------------------------------------------------------
const POSContext = createContext(null)

export function POSProvider({ children }) {
  const [state, dispatch] = useReducer(posReducer, initialState)

  // SyncContext provee el estado de conectividad y el fallback offline
  const { isOnline, saveOrderOffline } = useSync()

  // Totales derivados — calculados en cada render, no en el estado
  const totals = computeTotals(state.items, state.discount)

  // ── Inicializar branchId y sesión de caja al montar ──────────────────────
  useEffect(() => {
    async function init() {
      try {
        const branchId = localStorage.getItem('ferzu_branch_id')
        if (!branchId) return

        dispatch({ type: A.SET_BRANCH, payload: branchId })

        // Usar backend (supabaseAdmin) para bypassar RLS en cash_sessions
        const session = await cashAPI.current().catch(() => null)
        if (session) dispatch({ type: A.SET_CASH_SESSION, payload: session })
      } catch (e) {
        console.warn('[POSContext] init error:', e.message)
      }
    }
    init()
  }, [])

  // ── ACCIONES DEL CARRITO ──────────────────────────────────────────────────

  const addItem = useCallback((product) => {
    dispatch({ type: A.ADD_ITEM, payload: product })
  }, [])

  const removeItem = useCallback((productId) => {
    dispatch({ type: A.REMOVE_ITEM, payload: productId })
  }, [])

  const updateQty = useCallback((productId, qty) => {
    dispatch({ type: A.UPDATE_QTY, payload: { productId, qty } })
  }, [])

  const setDiscount = useCallback((discount) => {
    dispatch({ type: A.SET_DISCOUNT, payload: discount })
  }, [])

  const clearDiscount = useCallback(() => {
    dispatch({ type: A.CLEAR_DISCOUNT })
  }, [])

  const setCustomer = useCallback((customer) => {
    dispatch({ type: A.SET_CUSTOMER, payload: customer })
  }, [])

  const clearOrder = useCallback(() => {
    dispatch({ type: A.CLEAR_ORDER })
  }, [])

  // ── SESIÓN DE CAJA ───────────────────────────────────────────────────────

  const openCashSession = useCallback(async ({ openingCash = 0 }) => {
    dispatch({ type: A.SET_PROCESSING, payload: true })
    try {
      const branchId = localStorage.getItem('ferzu_branch_id')
      // Usar backend (supabaseAdmin) para bypassar RLS en cash_sessions
      const session = await cashAPI.open({
        branch_id:    branchId,
        opening_cash: Math.round(openingCash),
      })
      dispatch({ type: A.SET_CASH_SESSION, payload: session })
      toast.success('Caja abierta')
      return session
    } catch (e) {
      const msg = e?.response?.data?.error || 'No se pudo abrir la caja'
      toast.error(msg)
      throw e
    } finally {
      dispatch({ type: A.SET_PROCESSING, payload: false })
    }
  }, [])

  const closeCashSession = useCallback(async ({ closingCash = 0, notes = '' } = {}) => {
    if (!state.cashSession) return
    dispatch({ type: A.SET_PROCESSING, payload: true })
    try {
      // Usar backend (supabaseAdmin) para bypassar RLS en cash_sessions
      const data = await cashAPI.close(state.cashSession.id, {
        closing_cash: Math.round(closingCash),
        notes,
      })
      dispatch({ type: A.SET_CASH_SESSION, payload: null })
      toast.success('Caja cerrada')
      return data
    } catch (e) {
      toast.error('Error al cerrar la caja')
      throw e
    } finally {
      dispatch({ type: A.SET_PROCESSING, payload: false })
    }
  }, [state.cashSession])

  // ── PROCESAR PAGO ────────────────────────────────────────────────────────
  // REGLA DE ORO #1: el frontend solo envía ítems crudos; el backend calcula totales.
  // REGLA DE ORO #3: si no hay red, se guarda offline y sincroniza al reconectar.
  const processPayment = useCallback(async (paymentMethod, cashReceived) => {
    if (!state.cashSession) throw new Error('No hay sesión de caja activa')
    if (state.items.length === 0) throw new Error('El carrito está vacío')

    const orderPayload = {
      branch_id:       state.branchId,
      cash_session_id: state.cashSession.id,
      customer_id:     state.customerId || null,
      items: state.items.map(i => ({
        product_id:   i.product_id,
        product_name: i.product_name,
        product_sku:  i.product_sku,
        quantity:     i.quantity,
        unit_price:   i.unit_price,
        vat_rate:     i.vat_rate,
      })),
      payment_method: paymentMethod,
      cash_received:  paymentMethod === 'cash' ? Math.round(cashReceived) : null,
      discount:       state.discount || null,
    }

    dispatch({ type: A.SET_PROCESSING, payload: true })

    // ── Ruta 1: Online — backend valida y calcula totales ───────────────────
    let useOffline = !isOnline
    let order      = null

    if (!useOffline) {
      try {
        const { data } = await api.post('/orders', orderPayload)
        order = data
      } catch (e) {
        const isNetworkError = !e.response  // axios: sin .response = error de red
        if (!isNetworkError) {
          // Error de negocio (400/422/500) — no guardar offline, mostrar el error
          dispatch({ type: A.SET_PROCESSING, payload: false })
          toast.error(e.response?.data?.message || e.response?.data?.error || 'Error al procesar el pago')
          throw e
        }
        // Error de red → activar fallback offline
        useOffline = true
      }
    }

    // ── Ruta 2: Offline — Dexie + cola de sincronización ───────────────────
    if (useOffline) {
      try {
        const localId = await saveOrderOffline(orderPayload)
        order = { id: localId, offline: true }
        toast.success('Guardado sin conexión — se sincronizará al reconectar', {
          duration: 4000, icon: '📦',
        })
      } catch (offlineErr) {
        dispatch({ type: A.SET_PROCESSING, payload: false })
        toast.error('No se pudo guardar la venta. Intenta de nuevo.')
        throw offlineErr
      }
    } else {
      toast.success('¡Venta registrada!', { duration: 2000 })
    }

    dispatch({ type: A.SET_LAST_ORDER, payload: order.id })
    dispatch({ type: A.CLEAR_ORDER })
    dispatch({ type: A.SET_PROCESSING, payload: false })
    return order
  }, [state, isOnline, saveOrderOffline])

  // ── VALOR DEL CONTEXTO ───────────────────────────────────────────────────
  return (
    <POSContext.Provider value={{
      // Estado
      items:        state.items,
      discount:     state.discount,
      customerId:   state.customerId,
      customerName: state.customerName,
      cashSession:  state.cashSession,
      branchId:     state.branchId,
      isProcessing: state.isProcessing,
      lastOrderId:  state.lastOrderId,
      // Totales derivados (BIGINT, sin flotantes)
      totals,
      // Acciones del carrito
      addItem,
      removeItem,
      updateQty,
      setDiscount,
      clearDiscount,
      setCustomer,
      clearOrder,
      // Acciones de caja
      openCashSession,
      closeCashSession,
      processPayment,
      // Dispatch directo para casos especiales
      dispatch,
    }}>
      {children}
    </POSContext.Provider>
  )
}

export function usePOS() {
  const ctx = useContext(POSContext)
  if (!ctx) throw new Error('usePOS debe estar dentro de <POSProvider>')
  return ctx
}
