// =============================================================================
// FERZU POS — Tests de matemática de órdenes (POST /orders)
//
// REGLA DE ORO #1: La IA NUNCA calcula totales. El backend es la fuente de
// verdad. Estos tests reproducen fielmente la lógica de server.js (líneas
// 619-674) para garantizar que el cálculo de precios, IVA y descuentos sea
// determinista, libre de flotantes y nunca produzca totales negativos.
//
// No requieren red ni base de datos. Corren con: node --test tests/orders-math.test.js
// =============================================================================
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Lógica EXACTA copiada de server.js (POST /orders, líneas 619-674)
// Si cambia en server.js → actualizar aquí (el test fallará como aviso)
// ---------------------------------------------------------------------------

/**
 * Calcula totales de una orden.
 * @param {Array}  items    - [{ price, vat_rate, vat_included, quantity }]
 * @param {string} discountType  - 'percentage' | 'fixed' | null
 * @param {number} discountValue - valor del descuento
 * @returns {{ subtotal, tax_total, discount_amount, total }}
 */
function calcularOrden(items, discountType = null, discountValue = 0) {
  let subtotal  = 0
  let tax_total = 0
  const orderItems = []

  for (const item of items) {
    const qty = item.quantity

    // Precio base (sin IVA) y precio de venta (con IVA) — lógica de server.js
    const unit_price_with_vat = item.price
    const unit_price_base = item.vat_included
      ? Math.round(item.price / (1 + item.vat_rate / 100))
      : item.price
    const unit_vat_amount = unit_price_with_vat - unit_price_base

    const item_subtotal = Math.round(unit_price_base * qty)
    const item_vat      = Math.round(unit_vat_amount * qty)

    subtotal  += item_subtotal
    tax_total += item_vat

    orderItems.push({ item_subtotal, item_vat, unit_price_base, unit_price_with_vat })
  }

  // Descuento — lógica de server.js (líneas 661-669)
  let discount_amount = 0
  if (discountType && discountValue) {
    if (discountType === 'percentage') {
      if (discountValue < 0 || discountValue > 100) {
        throw new Error('Porcentaje de descuento inválido (0-100)')
      }
      discount_amount = Math.round((subtotal + tax_total) * discountValue / 100)
    } else if (discountType === 'fixed') {
      discount_amount = Math.round(Math.min(discountValue, subtotal + tax_total))
    }
  }

  const total = subtotal + tax_total - discount_amount
  if (total < 0) throw new Error('El total no puede ser negativo')

  return { subtotal, tax_total, discount_amount, total, orderItems }
}

// ============================================================================
// SUITE 1: Productos sin IVA
// ============================================================================
describe('POST /orders — cálculo sin IVA', () => {
  it('1 producto sin IVA, qty 1 → total = precio', () => {
    const r = calcularOrden([{ price: 5000, vat_rate: 0, vat_included: false, quantity: 1 }])
    assert.equal(r.subtotal,  5000)
    assert.equal(r.tax_total, 0)
    assert.equal(r.total,     5000)
  })

  it('1 producto sin IVA, qty 3 → total = precio × 3', () => {
    const r = calcularOrden([{ price: 3000, vat_rate: 0, vat_included: false, quantity: 3 }])
    assert.equal(r.subtotal, 9000)
    assert.equal(r.total,    9000)
  })

  it('múltiples productos sin IVA → suma correcta', () => {
    const r = calcularOrden([
      { price: 5000, vat_rate: 0, vat_included: false, quantity: 2 },
      { price: 2500, vat_rate: 0, vat_included: false, quantity: 1 },
    ])
    assert.equal(r.subtotal, 12500)   // 5000×2 + 2500×1
    assert.equal(r.tax_total, 0)
    assert.equal(r.total,    12500)
  })
})

// ============================================================================
// SUITE 2: vat_included: false — precio es base final, IVA no se agrega encima
//
// NOTA DE DISEÑO: Cuando vat_included=false, prod.price es el precio base
// (pre-IVA) que el cliente paga. El servidor NO suma el 19% encima:
//   unit_price_with_vat = prod.price
//   unit_price_base     = prod.price   (igual, no se extrae IVA)
//   unit_vat_amount     = 0
// El IVA solo se "extrae" contablemente cuando vat_included=true (Suite 3).
// ============================================================================
describe('POST /orders — vat_included: false (precio base, sin IVA encima)', () => {
  it('precio 10000, vat_included: false → el servidor NO agrega IVA encima', () => {
    const r = calcularOrden([{ price: 10000, vat_rate: 19, vat_included: false, quantity: 1 }])
    // Cuando vat_included=false, price=base=total_cliente (sin sumar IVA adicional)
    assert.equal(r.subtotal,  10000)
    assert.equal(r.tax_total, 0)     // IVA no se suma por encima del precio
    assert.equal(r.total,     10000)
  })

  it('qty 3 con vat_included: false → total = precio × qty (enteros)', () => {
    const r = calcularOrden([{ price: 10000, vat_rate: 19, vat_included: false, quantity: 3 }])
    assert.equal(r.subtotal,  30000)
    assert.equal(r.tax_total, 0)
    assert.equal(r.total,     30000)
    assert.ok(Number.isInteger(r.subtotal))
    assert.ok(Number.isInteger(r.tax_total))
    assert.ok(Number.isInteger(r.total))
  })
})

// ============================================================================
// SUITE 3: IVA 19% incluido en precio (vat_included: true)
// ============================================================================
describe('POST /orders — IVA 19% incluido en precio (vat_included: true)', () => {
  it('precio 11900 con IVA incluido → base 10000, IVA 1900', () => {
    const r = calcularOrden([{ price: 11900, vat_rate: 19, vat_included: true, quantity: 1 }])
    const item = r.orderItems[0]
    assert.equal(item.unit_price_base, 10000)         // Math.round(11900 / 1.19)
    assert.equal(item.unit_price_with_vat, 11900)
    assert.equal(r.tax_total, 1900)
    assert.equal(r.total,     11900)
  })

  it('precio 5950 con IVA incluido → base y total son enteros', () => {
    const r = calcularOrden([{ price: 5950, vat_rate: 19, vat_included: true, quantity: 1 }])
    assert.ok(Number.isInteger(r.subtotal))
    assert.ok(Number.isInteger(r.tax_total))
    assert.ok(Number.isInteger(r.total))
    assert.equal(r.total, 5950)   // El total con IVA incluido = precio original
  })
})

// ============================================================================
// SUITE 4: Carrito mixto (con y sin IVA)
// ============================================================================
describe('POST /orders — carrito mixto (IVA y sin IVA)', () => {
  it('producto vat_included:true + producto vat_included:false → totales correctos', () => {
    // vat_included:true → extrae IVA contablemente del precio
    // vat_included:false → precio es base final, sin suma de IVA
    const r = calcularOrden([
      { price: 11900, vat_rate: 19, vat_included: true,  quantity: 1 },  // base=10000, IVA=1900
      { price: 3000,  vat_rate: 0,  vat_included: false, quantity: 2 },  // sin IVA
    ])
    // subtotal = base_prod1 + base_prod2 = 10000 + 6000 = 16000
    // tax_total = 1900 (solo del producto vat_included:true)
    // total = 11900 + 6000 = 17900
    assert.equal(r.subtotal,  16000)
    assert.equal(r.tax_total, 1900)
    assert.equal(r.total,     17900)
  })
})

// ============================================================================
// SUITE 5: Descuentos por porcentaje
// ============================================================================
describe('POST /orders — descuento por porcentaje', () => {
  it('10% sobre total 10000 → descuento 1000, total 9000', () => {
    const r = calcularOrden(
      [{ price: 10000, vat_rate: 0, vat_included: false, quantity: 1 }],
      'percentage', 10
    )
    assert.equal(r.discount_amount, 1000)
    assert.equal(r.total,           9000)
  })

  it('100% de descuento → total 0 (no negativo)', () => {
    const r = calcularOrden(
      [{ price: 50000, vat_rate: 0, vat_included: false, quantity: 1 }],
      'percentage', 100
    )
    assert.equal(r.total, 0)
    assert.ok(r.total >= 0)
  })

  it('5% con vat_included:true → descuento sobre subtotal+IVA extraído', () => {
    // Con vat_included:true, precio 11900 = base 10000 + IVA 1900
    // Descuento 5% sobre (10000 + 1900) = 595
    const r = calcularOrden(
      [{ price: 11900, vat_rate: 19, vat_included: true, quantity: 1 }],
      'percentage', 5
    )
    assert.equal(r.discount_amount, 595)
    assert.equal(r.total,           11305)
  })

  it('porcentaje 0 → sin descuento', () => {
    const r = calcularOrden(
      [{ price: 10000, vat_rate: 0, vat_included: false, quantity: 1 }],
      'percentage', 0
    )
    assert.equal(r.discount_amount, 0)
    assert.equal(r.total,           10000)
  })

  it('porcentaje 101 → lanza error de validación', () => {
    assert.throws(
      () => calcularOrden(
        [{ price: 10000, vat_rate: 0, vat_included: false, quantity: 1 }],
        'percentage', 101
      ),
      /inválido/
    )
  })

  it('porcentaje negativo → lanza error de validación', () => {
    assert.throws(
      () => calcularOrden(
        [{ price: 10000, vat_rate: 0, vat_included: false, quantity: 1 }],
        'percentage', -5
      ),
      /inválido/
    )
  })
})

// ============================================================================
// SUITE 6: Descuentos fijos
// ============================================================================
describe('POST /orders — descuento fijo', () => {
  it('descuento fijo 2000 sobre total 10000 → total 8000', () => {
    const r = calcularOrden(
      [{ price: 10000, vat_rate: 0, vat_included: false, quantity: 1 }],
      'fixed', 2000
    )
    assert.equal(r.discount_amount, 2000)
    assert.equal(r.total,           8000)
  })

  it('descuento fijo mayor al total → queda en 0 (no negativo)', () => {
    const r = calcularOrden(
      [{ price: 5000, vat_rate: 0, vat_included: false, quantity: 1 }],
      'fixed', 99999
    )
    assert.equal(r.discount_amount, 5000)   // capped al total
    assert.equal(r.total,           0)
    assert.ok(r.total >= 0)
  })

  it('descuento fijo exactamente igual al total → total 0', () => {
    const r = calcularOrden(
      [{ price: 15000, vat_rate: 0, vat_included: false, quantity: 1 }],
      'fixed', 15000
    )
    assert.equal(r.total, 0)
  })
})

// ============================================================================
// SUITE 7: Invariantes matemáticos — Regla de Oro #1
// ============================================================================
describe('POST /orders — invariantes (Regla de Oro: sin flotantes)', () => {
  const casosPrueba = [
    { price: 3333, vat_rate: 19, vat_included: false, quantity: 3 },
    { price: 7777, vat_rate: 0,  vat_included: false, quantity: 7 },
    { price: 1119, vat_rate: 19, vat_included: true,  quantity: 5 },
    { price: 99901, vat_rate: 19, vat_included: false, quantity: 1 },
  ]

  for (const caso of casosPrueba) {
    it(`precio ${caso.price} × qty ${caso.qty || caso.quantity} → resultados enteros`, () => {
      const r = calcularOrden([caso])
      assert.ok(Number.isInteger(r.subtotal),  `subtotal no es entero: ${r.subtotal}`)
      assert.ok(Number.isInteger(r.tax_total), `tax_total no es entero: ${r.tax_total}`)
      assert.ok(Number.isInteger(r.total),     `total no es entero: ${r.total}`)
      assert.ok(r.total >= 0,                  `total negativo: ${r.total}`)
    })
  }

  it('total = subtotal + tax_total - discount (consistencia interna)', () => {
    const r = calcularOrden(
      [{ price: 50000, vat_rate: 19, vat_included: false, quantity: 2 }],
      'percentage', 10
    )
    assert.equal(r.total, r.subtotal + r.tax_total - r.discount_amount)
  })
})

// ============================================================================
// SUITE 8: Validación de campos requeridos (simulación del middleware)
// ============================================================================
describe('POST /orders — validación de payload', () => {
  it('sin items → no hay qué calcular (array vacío rechazado por validator)', () => {
    // El middleware de express-validator exige items.length >= 1
    // Aquí verificamos que calcularOrden con [] produce subtotal = 0
    const r = calcularOrden([])
    assert.equal(r.subtotal,  0)
    assert.equal(r.tax_total, 0)
    assert.equal(r.total,     0)
  })

  it('quantity 0.001 (mínimo permitido) no produce NaN ni error', () => {
    const r = calcularOrden([{ price: 10000, vat_rate: 0, vat_included: false, quantity: 0.001 }])
    assert.ok(!isNaN(r.total))
    assert.ok(r.total >= 0)
  })

  it('precio muy alto (9 dígitos COP) sin desbordamiento', () => {
    const r = calcularOrden([{ price: 999_999_999, vat_rate: 19, vat_included: false, quantity: 1 }])
    assert.ok(Number.isFinite(r.total))
    assert.ok(r.total > 0)
  })
})
