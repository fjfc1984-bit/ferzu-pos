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
  ADD_ITEM:            'ADD_ITEM',
  REMOVE_ITEM:         'REMOVE_ITEM',
  UPDATE_QTY:          'UPDATE_QTY',
  SET_DISCOUNT:        'SET_DISCOUNT',
  CLEAR_DISCOUNT:      'CLEAR_DISCOUNT',
  // F10: Cortesías
  SET_COURTESY:        'SET_COURTESY',
  CLEAR_COURTESY:      'CLEAR_COURTESY',
  TOGGLE_ITEM_COURTESY:'TOGGLE_ITEM_COURTESY',
  SET_CUSTOMER:        'SET_CUSTOMER',
  CLEAR_ORDER:         'CLEAR_ORDER',
  SET_CASH_SESSION:    'SET_CASH_SESSION',
  SET_BRANCH:          'SET_BRANCH',
  SET_BRANCH_NICHE:    'SET_BRANCH_NICHE',
  SET_PROCESSING:      'SET_PROCESSING',
  SET_LAST_ORDER:      'SET_LAST_ORDER',
  SET_SESSION_LOADING: 'SET_SESSION_LOADING',
}

// ---------------------------------------------------------------------------
// ESTADO INICIAL
// ---------------------------------------------------------------------------
const initialState = {
  items:          [],     // [{ cartKey, product_id, variant_id, product_name, unit_price, vat_rate, quantity, is_courtesy }]
  discount:       null,   // { type: 'pct'|'fixed', value, reason }
  // F10: Cortesías
  courtesy:       null,   // null | { scope: 'order'|'items', authorizedBy: string, reason: string }
  customerId:     null,
  customerName:   null,
  cashSession:    null,   // objeto completo de cash_sessions
  branchId:       null,
  branchNiche:    'general', // niche del branch activo: 'general'|'barbershop'|'restaurant'|'workshop'|'minimarket'
  isProcessing:   false,
  lastOrderId:    null,
  sessionLoading: true,   // true mientras init() carga la sesión desde el backend
}

// ---------------------------------------------------------------------------
// HELPERS MATEMÁTICOS — sin flotantes (REGLA DE ORO)
// ---------------------------------------------------------------------------
function itemSubtotal(unitPrice, qty) {
  return Math.round(unitPrice) * Math.round(qty)
}

function computeTotals(items, discount, courtesy) {
  let subtotal         = 0
  let tax_total        = 0
  let courtesy_amount  = 0

  const isOrderCourtesy = courtesy?.scope === 'order'

  for (const item of items) {
    const full = itemSubtotal(item.unit_price, item.quantity)
    // Si vat_included===true (defecto), el precio YA contiene IVA → extrae la base
    // Si vat_included===false, el precio es base → IVA se suma encima
    let itemBase, itemVat
    if (item.vat_rate > 0) {
      if (item.vat_included !== false) {
        itemBase = Math.round(full / (1 + item.vat_rate / 100))
        itemVat  = full - itemBase
      } else {
        itemBase = full
        itemVat  = Math.round(full * (item.vat_rate / 100))
      }
    } else {
      itemBase = full
      itemVat  = 0
    }
    const isItemCourtesy = isOrderCourtesy || item.is_courtesy

    if (isItemCourtesy) {
      courtesy_amount += itemBase + itemVat
    } else {
      subtotal  += itemBase
      tax_total += itemVat
    }
  }

  // Descuento solo aplica cuando no hay cortesía de orden
  let discount_amount = 0
  if (!isOrderCourtesy && discount && subtotal > 0) {
    discount_amount = discount.type === 'pct'
      ? Math.round((subtotal + tax_total) * (discount.value / 100))
      : Math.min(Math.round(discount.value), subtotal + tax_total)
  }

  const total = isOrderCourtesy
    ? 0
    : Math.max(0, subtotal + tax_total - discount_amount)

  return { subtotal, tax_total, discount_amount, courtesy_amount, total }
}

// ---------------------------------------------------------------------------
// REDUCER
// ---------------------------------------------------------------------------
function posReducer(state, { type, payload }) {
  switch (type) {

    case A.ADD_ITEM: {
      // cartKey: identifica de forma única producto + variante en el carrito
      const variant  = payload.variant || null
      const cartKey  = variant ? `${payload.id}-${variant.id}` : payload.id
      const existing = state.items.find(i => i.cartKey === cartKey)
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      // Precio: variante puede sobreescribir precio base
      const price = variant?.price != null
        ? Math.round(variant.price)
        : Math.round(payload.price)
      return {
        ...state,
        items: [...state.items, {
          cartKey,
          product_id:   payload.id,
          variant_id:   variant?.id   || null,
          variant_name: variant?.name || null,
          product_name: payload.name,
          product_sku:  variant?.sku  || payload.sku || '',
          unit_price:   price,
          vat_rate:     payload.vat_rate ?? 0,
          vat_included: payload.vat_included ?? true,  // precio ya incluye IVA
          quantity:     1,
        }],
      }
    }

    case A.REMOVE_ITEM:
      return { ...state, items: state.items.filter(i => i.cartKey !== payload) }

    case A.UPDATE_QTY: {
      const { cartKey, qty } = payload
      if (qty <= 0) return { ...state, items: state.items.filter(i => i.cartKey !== cartKey) }
      return {
        ...state,
        items: state.items.map(i =>
          i.cartKey === cartKey ? { ...i, quantity: Math.round(qty) } : i
        ),
      }
    }

    case A.SET_DISCOUNT:
      return { ...state, discount: payload }

    case A.CLEAR_DISCOUNT:
      return { ...state, discount: null }

    // F10: Cortesía de orden completa
    case A.SET_COURTESY:
      return { ...state, courtesy: payload, discount: null } // cortesía cancela descuento

    case A.CLEAR_COURTESY:
      return {
        ...state,
        courtesy: null,
        items: state.items.map(i => ({ ...i, is_courtesy: false })),
      }

    // F10: Toggle cortesía en un ítem individual
    case A.TOGGLE_ITEM_COURTESY: {
      const { cartKey, authorizedBy } = payload
      return {
        ...state,
        items: state.items.map(i =>
          i.cartKey === cartKey
            ? { ...i, is_courtesy: !i.is_courtesy, courtesy_authorized_by: !i.is_courtesy ? authorizedBy : null }
            : i
        ),
      }
    }

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
        courtesy:     null,
        customerId:   null,
        customerName: null,
        isProcessing: false,
      }

    case A.SET_CASH_SESSION:
      return { ...state, cashSession: payload }

    case A.SET_BRANCH:
      return { ...state, branchId: payload }

    case A.SET_BRANCH_NICHE:
      return { ...state, branchNiche: payload || 'general' }

    case A.SET_PROCESSING:
      return { ...state, isProcessing: payload }

    case A.SET_LAST_ORDER:
      return { ...state, lastOrderId: payload }

    case A.SET_SESSION_LOADING:
      return { ...state, sessionLoading: payload }

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
  const totals = computeTotals(state.items, state.discount, state.courtesy)

  // ── Inicializar branchId y sesión de caja al montar ──────────────────────
  useEffect(() => {
    async function init() {
      try {
        const branchId = localStorage.getItem('ferzu_branch_id')
        if (!branchId) return

        dispatch({ type: A.SET_BRANCH, payload: branchId })

        // Resolver el niche de la branch activa para filtrar productos y categorías
        const { data: branchData } = await supabase
          .from('branches')
          .select('niche')
          .eq('id', branchId)
          .single()
        if (branchData?.niche) {
          dispatch({ type: A.SET_BRANCH_NICHE, payload: branchData.niche })
          localStorage.setItem('ferzu_branch_niche', branchData.niche)
        }

        // Usar backend (supabaseAdmin) para bypassar RLS en cash_sessions
        const session = await cashAPI.current().catch(() => null)
        if (session) dispatch({ type: A.SET_CASH_SESSION, payload: session })
      } catch (e) {
        console.warn('[POSContext] init error:', e.message)
      } finally {
        dispatch({ type: A.SET_SESSION_LOADING, payload: false })
      }
    }
    init()
  }, [])

  // ── ACCIONES DEL CARRITO ──────────────────────────────────────────────────

  // variant: objeto completo de product_variants (o null para producto base)
  const addItem = useCallback((product, variant = null) => {
    dispatch({ type: A.ADD_ITEM, payload: { ...product, variant } })
  }, [])

  // cartKey: item.cartKey (ej: "uuid" o "uuid-variantUuid")
  const removeItem = useCallback((cartKey) => {
    dispatch({ type: A.REMOVE_ITEM, payload: cartKey })
  }, [])

  const updateQty = useCallback((cartKey, qty) => {
    dispatch({ type: A.UPDATE_QTY, payload: { cartKey, qty } })
  }, [])

  const setDiscount = useCallback((discount) => {
    dispatch({ type: A.SET_DISCOUNT, payload: discount })
  }, [])

  const clearDiscount = useCallback(() => {
    dispatch({ type: A.CLEAR_DISCOUNT })
  }, [])

  // F10: Cortesías
  // courtesy = { scope: 'order'|'items', authorizedBy: string, reason: string }
  const setCourtesy = useCallback((courtesy) => {
    dispatch({ type: A.SET_COURTESY, payload: courtesy })
  }, [])

  const clearCourtesy = useCallback(() => {
    dispatch({ type: A.CLEAR_COURTESY })
  }, [])

  // Alterna cortesía en un ítem individual
  const toggleItemCourtesy = useCallback((cartKey, authorizedBy) => {
    dispatch({ type: A.TOGGLE_ITEM_COURTESY, payload: { cartKey, authorizedBy } })
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
  const processPayment = useCallback(async (paymentMethod, cashReceived, tipAmount = 0, loyaltyOpts = {}, invoiceOverrides = {}, customerContext = {}) => {
    if (!state.cashSession) throw new Error('No hay sesión de caja activa')
    if (state.items.length === 0) throw new Error('El carrito está vacío')

    const orderPayload = {
      branch_id:        state.branchId,
      cash_session_id:  state.cashSession.id,
      order_type:       'sale',
      // customer_id: usar el del modal de identificación si está disponible,
      // sino el asignado por CustomerSearch en el carrito
      customer_id:     'customer_id_override' in customerContext
        ? customerContext.customer_id_override
        : state.customerId || null,
      // Flag obligatorio: el cajero pasó por el flujo de identificación
      customer_identified: customerContext.customer_identified || false,
      items: state.items.map(i => ({
        product_id:             i.product_id,
        variant_id:             i.variant_id || null,
        product_name:           i.product_name,
        product_sku:            i.product_sku,
        quantity:               i.quantity,
        unit_price:             i.unit_price,
        vat_rate:               i.vat_rate,
        // F10: cortesía por ítem
        is_courtesy:            i.is_courtesy || false,
        courtesy_authorized_by: i.courtesy_authorized_by || null,
      })),
      // F10: cortesía de orden completa
      is_courtesy:            state.courtesy?.scope === 'order' || false,
      courtesy_authorized_by: state.courtesy?.authorizedBy || null,
      courtesy_reason:        state.courtesy?.reason       || null,
      payment_method:  paymentMethod,
      cash_received:   paymentMethod === 'cash' ? Math.round(cashReceived) : null,
      // discount del POS → campos separados que espera el backend
      discount_type:   state.discount?.type === 'pct' ? 'percentage' : (state.discount?.type === 'fixed' ? 'fixed' : undefined),
      discount_value:  state.discount?.value ?? undefined,
      // Propina: monto entero elegido explícitamente por el cajero/cliente
      tip_amount:      Math.round(Math.max(0, Number(tipAmount) || 0)),
      // F9-A: Fidelización (0 por defecto — no bloquea si el programa no está activo)
      loyalty_discount:        Math.round(Math.max(0, Number(loyaltyOpts.loyaltyDiscount) || 0)),
      loyalty_points_redeemed: Math.round(Math.max(0, Number(loyaltyOpts.loyaltyPoints)   || 0)),
      // DIAN: datos del comprador para factura electrónica (opcionales)
      // Solo se envían si el cajero activó "¿Requiere factura?" en el checkout
      ...(invoiceOverrides.invoice_nit      && { invoice_nit:      invoiceOverrides.invoice_nit }),
      ...(invoiceOverrides.invoice_email    && { invoice_email:    invoiceOverrides.invoice_email }),
      ...(invoiceOverrides.invoice_name     && { invoice_name:     invoiceOverrides.invoice_name }),
      ...(invoiceOverrides.invoice_doc_type && { invoice_doc_type: invoiceOverrides.invoice_doc_type }),
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

  // ── PROCESAR PAGO MIXTO (efectivo + tarjeta) ────────────────────────────
  // Flujo de dos pasos: crea orden sin payment_method → paga cash parcial → paga card resto
  const processPaymentMixed = useCallback(async (cashAmt, cardAmt, tipAmount = 0, customerContext = {}) => {
    if (!state.cashSession) throw new Error('No hay sesión de caja activa')
    if (state.items.length === 0) throw new Error('El carrito está vacío')

    const orderPayload = {
      branch_id:        state.branchId,
      cash_session_id:  state.cashSession.id,
      order_type:       'sale',
      customer_id:     'customer_id_override' in customerContext
        ? customerContext.customer_id_override
        : state.customerId || null,
      customer_identified: customerContext.customer_identified || false,
      items: state.items.map(i => ({
        product_id:             i.product_id,
        variant_id:             i.variant_id || null,
        product_name:           i.product_name,
        product_sku:            i.product_sku,
        quantity:               i.quantity,
        unit_price:             i.unit_price,
        vat_rate:               i.vat_rate,
        is_courtesy:            i.is_courtesy || false,
        courtesy_authorized_by: i.courtesy_authorized_by || null,
      })),
      is_courtesy:            state.courtesy?.scope === 'order' || false,
      courtesy_authorized_by: state.courtesy?.authorizedBy || null,
      courtesy_reason:        state.courtesy?.reason       || null,
      // Sin payment_method: se pagan en pasos separados
      discount_type:  state.discount?.type === 'pct' ? 'percentage' : (state.discount?.type === 'fixed' ? 'fixed' : undefined),
      discount_value: state.discount?.value ?? undefined,
      tip_amount:     Math.round(Math.max(0, Number(tipAmount) || 0)),
    }

    dispatch({ type: A.SET_PROCESSING, payload: true })

    try {
      // Paso 1: Crear orden abierta sin pago
      const { data: order } = await api.post('/orders', orderPayload)

      // Paso 2: Pago parcial en efectivo
      await api.post(`/orders/${order.id}/payment`, {
        payment_method: 'cash',
        amount:         Math.round(cashAmt),
        cash_received:  Math.round(cashAmt),
      })

      // Paso 3: Pago restante con tarjeta débito
      await api.post(`/orders/${order.id}/payment`, {
        payment_method: 'card_debit',
        amount:         Math.round(cardAmt),
      })

      toast.success('¡Venta registrada!', { duration: 2000 })
      dispatch({ type: A.SET_LAST_ORDER, payload: order.id })
      dispatch({ type: A.CLEAR_ORDER })
      dispatch({ type: A.SET_PROCESSING, payload: false })
      return order
    } catch (e) {
      const isNetworkError = !e.response
      if (!isNetworkError) {
        dispatch({ type: A.SET_PROCESSING, payload: false })
        toast.error(e.response?.data?.message || e.response?.data?.error || 'Error en pago mixto')
        throw e
      }
      // Sin red → guardar offline con ambos montos para sincronizar después
      try {
        const localId = await saveOrderOffline({
          ...orderPayload,
          payment_method: 'mixed',
          cash_amount:    Math.round(cashAmt),
          card_amount:    Math.round(cardAmt),
        })
        const order = { id: localId, offline: true }
        toast.success('Guardado sin conexión — se sincronizará al reconectar', {
          duration: 4000, icon: '📦',
        })
        dispatch({ type: A.CLEAR_ORDER })
        dispatch({ type: A.SET_PROCESSING, payload: false })
        return order
      } catch (offlineErr) {
        dispatch({ type: A.SET_PROCESSING, payload: false })
        toast.error('No se pudo guardar la venta. Intenta de nuevo.')
        throw offlineErr
      }
    }
  }, [state, saveOrderOffline])

  // ── VALOR DEL CONTEXTO ───────────────────────────────────────────────────
  return (
    <POSContext.Provider value={{
      // Estado
      items:        state.items,
      discount:     state.discount,
      courtesy:     state.courtesy,
      customerId:   state.customerId,
      customerName: state.customerName,
      cashSession:    state.cashSession,
      branchId:       state.branchId,
      branchNiche:    state.branchNiche,
      isProcessing:   state.isProcessing,
      lastOrderId:    state.lastOrderId,
      sessionLoading: state.sessionLoading,
      // Totales derivados (BIGINT, sin flotantes)
      totals,
      // Acciones del carrito
      addItem,
      removeItem,
      updateQty,
      setDiscount,
      clearDiscount,
      // F10: Cortesías
      setCourtesy,
      clearCourtesy,
      toggleItemCourtesy,
      setCustomer,
      clearOrder,
      // Acciones de caja
      openCashSession,
      closeCashSession,
      processPayment,
      processPaymentMixed,
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
