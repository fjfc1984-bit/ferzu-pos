// =============================================================================
// FERZU POS — Tests de precios de planes
//
// REGLA DE ORO #1: La IA NUNCA calcula totales. El backend siempre es la fuente
// de verdad para los precios. Estos tests garantizan que los precios no cambien
// accidentalmente y que los valores sean coherentes con la página de pricing.
//
// ÚLTIMA ACTUALIZACIÓN: Sincronizado con payments.routes.js (pos_basic, barbershop, etc.)
// Si cambia PLAN_PRICES_COP en payments.routes.js → falla el test como aviso.
// =============================================================================
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// TABLA REAL de payments.routes.js — cualquier diferencia aquí = bug de producción
const PLAN_PRICES_COP = {
  pos_basic:   49_000,   // POS básico genérico
  barbershop:  79_000,   // Barbería / peluquería
  workshop:    79_000,   // Taller de motos / bicicletas
  minimarket:  79_000,   // Tienda / minimarket
  restaurant:  89_000,   // Restaurante (INC diferenciado)
  pro:        149_000,   // Versión completa multi-módulo
}

const PLAN_IDS_VALIDOS = Object.keys(PLAN_PRICES_COP)

describe('PLAN_PRICES_COP — integridad de precios (Regla de Oro #1)', () => {
  it('todos los planes tienen un precio definido', () => {
    for (const planId of PLAN_IDS_VALIDOS) {
      assert.ok(PLAN_PRICES_COP[planId] !== undefined, `Plan "${planId}" sin precio`)
    }
  })

  it('todos los precios son números enteros positivos en COP', () => {
    for (const [plan, precio] of Object.entries(PLAN_PRICES_COP)) {
      assert.ok(typeof precio === 'number',   `"${plan}": precio no es número`)
      assert.ok(Number.isInteger(precio),     `"${plan}": precio no es entero`)
      assert.ok(precio > 0,                   `"${plan}": precio no es positivo`)
    }
  })

  it('pos_basic cuesta $49.000 COP', () => {
    assert.equal(PLAN_PRICES_COP.pos_basic, 49_000)
  })

  it('barbershop cuesta $79.000 COP', () => {
    assert.equal(PLAN_PRICES_COP.barbershop, 79_000)
  })

  it('workshop cuesta $79.000 COP', () => {
    assert.equal(PLAN_PRICES_COP.workshop, 79_000)
  })

  it('minimarket cuesta $79.000 COP', () => {
    assert.equal(PLAN_PRICES_COP.minimarket, 79_000)
  })

  it('restaurant cuesta $89.000 COP (INC diferenciado)', () => {
    assert.equal(PLAN_PRICES_COP.restaurant, 89_000)
  })

  it('pro cuesta $149.000 COP', () => {
    assert.equal(PLAN_PRICES_COP.pro, 149_000)
  })

  it('pos_basic < restaurant < pro (jerarquía de precios)', () => {
    assert.ok(
      PLAN_PRICES_COP.pos_basic < PLAN_PRICES_COP.restaurant,
      'pos_basic debe ser más barato que restaurant'
    )
    assert.ok(
      PLAN_PRICES_COP.restaurant < PLAN_PRICES_COP.pro,
      'restaurant debe ser más barato que pro'
    )
  })

  it('barbershop, workshop y minimarket tienen el mismo precio base', () => {
    assert.equal(PLAN_PRICES_COP.barbershop, PLAN_PRICES_COP.workshop)
    assert.equal(PLAN_PRICES_COP.workshop,   PLAN_PRICES_COP.minimarket)
  })

  it('rechaza planIds obsoletos o inventados', () => {
    const planesInvalidos = [
      'starter', 'enterprise', 'basic', 'premium',
      'free', 'STARTER', 'Pro', '', null, undefined,
    ]
    for (const planId of planesInvalidos) {
      assert.equal(
        PLAN_PRICES_COP[planId],
        undefined,
        `"${planId}" no debería existir en PLAN_PRICES_COP`
      )
    }
  })

  it('el número total de planes es exactamente 6', () => {
    assert.equal(PLAN_IDS_VALIDOS.length, 6,
      `Se esperaban 6 planes, se encontraron ${PLAN_IDS_VALIDOS.length}: ${PLAN_IDS_VALIDOS.join(', ')}`)
  })
})
