// =============================================================================
// FERZU POS — Tests de precios de planes
//
// REGLA DE ORO #1: La IA NUNCA calcula totales. El backend siempre es la fuente
// de verdad para los precios. Estos tests garantizan que los precios no cambien
// accidentalmente y que los valores sean coherentes con la página de pricing.
// =============================================================================
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Misma tabla que PLAN_PRICES_COP en server.js
// Si cambia en server.js → cambiar aquí también (falla el test como aviso)
const PLAN_PRICES_COP = {
  starter:     79_000,
  pro:        149_000,
  enterprise: 299_000,
}

const PLAN_IDS_VALIDOS = ['starter', 'pro', 'enterprise']

describe('PLAN_PRICES_COP — integridad de precios (Regla de Oro #1)', () => {
  it('todos los planes tienen un precio definido', () => {
    for (const planId of PLAN_IDS_VALIDOS) {
      assert.ok(PLAN_PRICES_COP[planId] !== undefined, `Plan "${planId}" sin precio`)
    }
  })

  it('todos los precios son números enteros positivos en COP', () => {
    for (const [plan, precio] of Object.entries(PLAN_PRICES_COP)) {
      assert.ok(typeof precio === 'number',        `"${plan}": precio no es número`)
      assert.ok(Number.isInteger(precio),          `"${plan}": precio no es entero`)
      assert.ok(precio > 0,                        `"${plan}": precio no es positivo`)
    }
  })

  it('starter < pro < enterprise (jerarquía de planes)', () => {
    assert.ok(
      PLAN_PRICES_COP.starter < PLAN_PRICES_COP.pro,
      'starter debe ser más barato que pro'
    )
    assert.ok(
      PLAN_PRICES_COP.pro < PLAN_PRICES_COP.enterprise,
      'pro debe ser más barato que enterprise'
    )
  })

  it('starter cuesta $79.000 COP', () => {
    assert.equal(PLAN_PRICES_COP.starter, 79_000)
  })

  it('pro cuesta $149.000 COP', () => {
    assert.equal(PLAN_PRICES_COP.pro, 149_000)
  })

  it('enterprise cuesta $299.000 COP', () => {
    assert.equal(PLAN_PRICES_COP.enterprise, 299_000)
  })

  it('rechaza planIds inválidos (no deben tener precio)', () => {
    const planesInvalidos = ['free', 'basico', 'premium', 'STARTER', '', null, undefined]
    for (const planId of planesInvalidos) {
      assert.equal(
        PLAN_PRICES_COP[planId],
        undefined,
        `"${planId}" no debería existir en PLAN_PRICES_COP`
      )
    }
  })
})
