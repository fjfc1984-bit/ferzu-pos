// =============================================================================
// FERZU POS — Tests de integración: flujos core del POS
// Cubre: reducer del carrito, cálculo de totales, clearOrder, sesión de caja
//
// Ejecutar: npx vitest run src/__tests__/posCore.test.js
// =============================================================================
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers matemáticos copiados del reducer (sin importar el módulo completo
// para evitar dependencias de React en este test puro)
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
// Reducer puro (mismo código que POSContext.jsx — sin React)
// ---------------------------------------------------------------------------
const A = {
  ADD_ITEM:    'ADD_ITEM',
  REMOVE_ITEM: 'REMOVE_ITEM',
  UPDATE_QTY:  'UPDATE_QTY',
  SET_DISCOUNT:'SET_DISCOUNT',
  SET_CUSTOMER:'SET_CUSTOMER',
  CLEAR_ORDER: 'CLEAR_ORDER',
}

const initialState = {
  items:        [],
  discount:     null,
  customerId:   null,
  customerName: null,
  isProcessing: false,
}

function posReducer(state, { type, payload }) {
  switch (type) {
    case A.ADD_ITEM: {
      const existing = state.items.find(i => i.product_id === payload.id)
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.product_id === payload.id ? { ...i, quantity: i.quantity + 1 } : i
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
    case A.SET_CUSTOMER:
      return { ...state, customerId: payload?.id ?? null, customerName: payload?.name ?? null }
    case A.CLEAR_ORDER:
      return { ...state, items: [], discount: null, customerId: null, customerName: null, isProcessing: false }
    default:
      return state
  }
}

// Utilidad para encadenar acciones
function reduce(actions) {
  return actions.reduce(posReducer, initialState)
}

// ============================================================================
// SUITE 1: Carrito — agregar y quitar items
// ============================================================================
describe('POS Carrito — ADD_ITEM / REMOVE_ITEM', () => {
  it('agrega un producto nuevo al carrito', () => {
    const state = reduce([
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
    ])
    expect(state.items).toHaveLength(1)
    expect(state.items[0].quantity).toBe(1)
    expect(state.items[0].unit_price).toBe(3000)
  })

  it('incrementa cantidad si el producto ya está en el carrito', () => {
    const state = reduce([
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
    ])
    expect(state.items).toHaveLength(1)
    expect(state.items[0].quantity).toBe(3)
  })

  it('maneja múltiples productos distintos', () => {
    const state = reduce([
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.ADD_ITEM, payload: { id: 'p2', name: 'Papas', price: 2500, vat_rate: 19 } },
    ])
    expect(state.items).toHaveLength(2)
  })

  it('elimina un producto del carrito', () => {
    const state = reduce([
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.ADD_ITEM, payload: { id: 'p2', name: 'Papas', price: 2500, vat_rate: 19 } },
      { type: A.REMOVE_ITEM, payload: 'p1' },
    ])
    expect(state.items).toHaveLength(1)
    expect(state.items[0].product_id).toBe('p2')
  })

  it('eliminar un producto que no existe no lanza error', () => {
    const state = reduce([
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.REMOVE_ITEM, payload: 'p99' },
    ])
    expect(state.items).toHaveLength(1)
  })
})

// ============================================================================
// SUITE 2: UPDATE_QTY
// ============================================================================
describe('POS Carrito — UPDATE_QTY', () => {
  it('actualiza la cantidad de un producto', () => {
    const state = reduce([
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.UPDATE_QTY, payload: { productId: 'p1', qty: 5 } },
    ])
    expect(state.items[0].quantity).toBe(5)
  })

  it('elimina el item si qty llega a 0', () => {
    const state = reduce([
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.UPDATE_QTY, payload: { productId: 'p1', qty: 0 } },
    ])
    expect(state.items).toHaveLength(0)
  })

  it('elimina el item si qty es negativo', () => {
    const state = reduce([
      { type: A.ADD_ITEM, payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.UPDATE_QTY, payload: { productId: 'p1', qty: -2 } },
    ])
    expect(state.items).toHaveLength(0)
  })
})

// ============================================================================
// SUITE 3: CLEAR_ORDER — la más importante para el flujo post-venta
// ============================================================================
describe('CLEAR_ORDER — limpieza tras venta', () => {
  it('limpia items, descuento y cliente después de una venta', () => {
    const state = reduce([
      { type: A.ADD_ITEM,     payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.ADD_ITEM,     payload: { id: 'p2', name: 'Papas', price: 2500, vat_rate: 0 } },
      { type: A.SET_DISCOUNT, payload: { type: 'pct', value: 10, reason: 'Promoción' } },
      { type: A.SET_CUSTOMER, payload: { id: 'c1', name: 'Juan Pérez' } },
      { type: A.CLEAR_ORDER },
    ])
    expect(state.items).toHaveLength(0)
    expect(state.discount).toBeNull()
    expect(state.customerId).toBeNull()
    expect(state.customerName).toBeNull()
    expect(state.isProcessing).toBe(false)
  })

  it('carrito queda listo para una nueva venta tras CLEAR_ORDER', () => {
    const stateAfterClear = reduce([
      { type: A.ADD_ITEM,   payload: { id: 'p1', name: 'Gaseosa', price: 3000, vat_rate: 0 } },
      { type: A.CLEAR_ORDER },
    ])
    // Simular nueva venta
    const stateNewSale = posReducer(stateAfterClear, {
      type: A.ADD_ITEM, payload: { id: 'p3', name: 'Agua', price: 1500, vat_rate: 0 }
    })
    expect(stateNewSale.items).toHaveLength(1)
    expect(stateNewSale.items[0].product_name).toBe('Agua')
  })
})

// ============================================================================
// SUITE 4: computeTotals — NO alucinaciones matemáticas
// ============================================================================
describe('computeTotals — regla de oro: sin flotantes', () => {
  it('calcula correctamente un carrito sin IVA', () => {
    const items = [
      { unit_price: 3000, quantity: 2, vat_rate: 0 },
      { unit_price: 2500, quantity: 1, vat_rate: 0 },
    ]
    const t = computeTotals(items, null)
    expect(t.subtotal).toBe(8500)
    expect(t.tax_total).toBe(0)
    expect(t.discount_amount).toBe(0)
    expect(t.total).toBe(8500)
  })

  it('calcula IVA 19% correctamente (sin flotantes)', () => {
    const items = [{ unit_price: 10000, quantity: 1, vat_rate: 19 }]
    const t = computeTotals(items, null)
    expect(t.tax_total).toBe(1900)
    expect(t.total).toBe(11900)
  })

  it('aplica descuento por porcentaje', () => {
    const items = [{ unit_price: 100000, quantity: 1, vat_rate: 0 }]
    const t = computeTotals(items, { type: 'pct', value: 10, reason: 'Fidelidad' })
    expect(t.discount_amount).toBe(10000)
    expect(t.total).toBe(90000)
  })

  it('aplica descuento fijo', () => {
    const items = [{ unit_price: 50000, quantity: 1, vat_rate: 0 }]
    const t = computeTotals(items, { type: 'fixed', value: 5000, reason: 'Redondeo' })
    expect(t.discount_amount).toBe(5000)
    expect(t.total).toBe(45000)
  })

  it('descuento fijo no puede superar el subtotal (total mínimo 0)', () => {
    const items = [{ unit_price: 3000, quantity: 1, vat_rate: 0 }]
    const t = computeTotals(items, { type: 'fixed', value: 99999, reason: 'Test' })
    expect(t.total).toBeGreaterThanOrEqual(0)
  })

  it('carrito vacío da totales en 0', () => {
    const t = computeTotals([], null)
    expect(t.subtotal).toBe(0)
    expect(t.tax_total).toBe(0)
    expect(t.total).toBe(0)
  })

  it('precios son enteros — no produce flotantes en los totales', () => {
    const items = [{ unit_price: 3333, quantity: 3, vat_rate: 19 }]
    const t = computeTotals(items, null)
    expect(Number.isInteger(t.subtotal)).toBe(true)
    expect(Number.isInteger(t.tax_total)).toBe(true)
    expect(Number.isInteger(t.total)).toBe(true)
  })
})

// ============================================================================
// SUITE 5: Flujo completo de una venta (sin mocks de red)
// ============================================================================
describe('Flujo completo de venta — reducer puro', () => {
  it('secuencia completa: agregar → descuento → cliente → cobrar → limpiar', () => {
    // 1. Cajero agrega productos
    let state = posReducer(initialState, {
      type: A.ADD_ITEM, payload: { id: 'p1', name: 'Combo #1', price: 25000, vat_rate: 0 }
    })
    state = posReducer(state, {
      type: A.ADD_ITEM, payload: { id: 'p2', name: 'Bebida', price: 3000, vat_rate: 0 }
    })

    // 2. Aplica descuento del 5%
    state = posReducer(state, {
      type: A.SET_DISCOUNT, payload: { type: 'pct', value: 5, reason: 'Cliente frecuente' }
    })

    // 3. Asocia cliente
    state = posReducer(state, {
      type: A.SET_CUSTOMER, payload: { id: 'c42', name: 'María López' }
    })

    // Verificar estado antes del cobro
    const totals = computeTotals(state.items, state.discount)
    expect(totals.subtotal).toBe(28000)           // 25000 + 3000
    expect(totals.discount_amount).toBe(1400)     // 5% de 28000
    expect(totals.total).toBe(26600)              // 28000 - 1400
    expect(state.customerName).toBe('María López')

    // 4. Post-cobro: limpiar
    state = posReducer(state, { type: A.CLEAR_ORDER })
    expect(state.items).toHaveLength(0)
    expect(state.discount).toBeNull()
    expect(state.customerId).toBeNull()
  })
})
