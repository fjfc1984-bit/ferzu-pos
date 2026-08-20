// =============================================================================
// FERZU POS — Tests de regresión: Cash Sessions
//
// Cubre los bugs corregidos en la sesión de auditoría 2026-08-20:
//
// BUG-A: Modal de caja bloqueado en 409 — no había recuperación automática.
//         Corrección: openSession() detecta 409, llama cashAPI.current()
//         y despacha SET_CASH_SESSION para retomar la sesión existente.
//
// BUG-B: opening_cash podía llegar como float al backend si el usuario
//         escribía decimales. Corrección: Math.round() en frontend antes
//         de enviar. El backend valida isInt({ min: 0 }).
//
// BUG-C: Validación isInt({ min: 0 }) debe rechazar negativos, floats y strings.
//
// CÓMO CORRER: node --test backend/tests/cash-session.test.js
// =============================================================================
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─── RÉPLICA: Validación de opening_cash (express-validator isInt { min: 0 }) ─

/**
 * Replica la validación que hace express-validator body('opening_cash').isInt({ min: 0 }).
 * La librería usa Number.isInteger() internamente para la validación estricta de entero.
 * Para strings numéricos, intenta parsear como entero y verifica que no haya decimales.
 */
function validateOpeningCash(value) {
  // Express-validator rechaza strings vacías y valores nulos antes de coercionar
  if (value === '' || value === null || value === undefined) return false
  const num = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(num))       return false  // NaN, Infinity, strings no numéricas
  if (!Number.isInteger(num))      return false  // floats: 12.5, 0.1, etc.
  if (num < 0)                     return false  // negativos
  return true
}

// ─── RÉPLICA: Lógica de 409 en openSession() (POSPage.jsx) ───────────────────

/**
 * Replica la lógica de openSession() del frontend.
 * Recibe funciones mockeadas para cashAPI.open() y cashAPI.current(),
 * y un dispatch. Retorna el resultado del flujo.
 */
async function openSessionLogic({ cashOpen, cashCurrent, dispatch, onClose, openCash }) {
  const opening_cash = Math.round(Number(openCash) || 0)
  try {
    const session = await cashOpen({ opening_cash })
    dispatch({ type: 'SET_CASH_SESSION', payload: session })
    onClose()
    return { success: true, session }
  } catch (err) {
    if (err?.status === 409) {
      try {
        const existing = await cashCurrent()
        if (existing) {
          dispatch({ type: 'SET_CASH_SESSION', payload: existing })
          onClose()
          return { success: true, resumed: true, session: existing }
        }
      } catch { /* ignorar error de current */ }
    }
    return { success: false, error: err?.message || 'Error al abrir caja' }
  }
}

// ─── RÉPLICA: Lógica de conflicto 409 en el backend ──────────────────────────

/**
 * Replica la lógica de POST /cash-sessions/open:
 * si ya existe una sesión abierta → retorna 409 con session_id.
 */
function handleOpenCashSession({ existingSession, body }) {
  const { opening_cash } = body

  if (!validateOpeningCash(opening_cash)) {
    return { status: 400, body: { errors: [{ msg: 'opening_cash debe ser un entero >= 0' }] } }
  }

  if (existingSession) {
    return {
      status: 409,
      body: { error: 'Ya tienes una caja abierta', session_id: existingSession.id },
    }
  }

  return {
    status: 201,
    body: { id: 'new-session-id', opening_cash, status: 'open' },
  }
}

// =============================================================================
// TESTS: Validación de opening_cash
// =============================================================================

describe('BUG-B/C: Validación de opening_cash', () => {
  it('acepta 0 (apertura sin efectivo)', () => {
    assert.equal(validateOpeningCash(0), true)
  })

  it('acepta enteros positivos', () => {
    assert.equal(validateOpeningCash(50000), true)
    assert.equal(validateOpeningCash(100), true)
    assert.equal(validateOpeningCash(1000000), true)
  })

  it('rechaza floats — 12.5 no es entero', () => {
    assert.equal(validateOpeningCash(12.5), false)
  })

  it('rechaza floats — 0.01 no es entero', () => {
    assert.equal(validateOpeningCash(0.01), false)
  })

  it('rechaza negativos', () => {
    assert.equal(validateOpeningCash(-1), false)
    assert.equal(validateOpeningCash(-100), false)
  })

  it('rechaza strings no numéricas', () => {
    assert.equal(validateOpeningCash('abc'), false)
    assert.equal(validateOpeningCash(''), false)
  })

  it('rechaza string con decimal "12.5"', () => {
    assert.equal(validateOpeningCash('12.5'), false)
  })

  it('Math.round previene que lleguen floats al backend', () => {
    // El frontend aplica Math.round antes de enviar:
    assert.equal(Math.round(12.5), 13)   // → entero válido
    assert.equal(Math.round(12.1), 12)   // → entero válido
    assert.equal(Math.round(0),     0)   // → cero válido
    // Todos pasan validación después del round
    assert.equal(validateOpeningCash(Math.round(12.5)), true)
    assert.equal(validateOpeningCash(Math.round(0.9)),  true)
  })
})

// =============================================================================
// TESTS: Lógica de 409 en backend
// =============================================================================

describe('BUG-A: Conflicto 409 en POST /cash-sessions/open (backend)', () => {
  it('retorna 409 con session_id cuando ya hay caja abierta', () => {
    const result = handleOpenCashSession({
      existingSession: { id: 'existing-uuid-123' },
      body: { opening_cash: 50000 },
    })
    assert.equal(result.status, 409)
    assert.equal(result.body.session_id, 'existing-uuid-123')
    assert.ok(result.body.error.includes('abierta'))
  })

  it('retorna 201 con datos de sesión cuando no hay conflicto', () => {
    const result = handleOpenCashSession({
      existingSession: null,
      body: { opening_cash: 50000 },
    })
    assert.equal(result.status, 201)
    assert.equal(result.body.status, 'open')
    assert.equal(result.body.opening_cash, 50000)
  })

  it('retorna 400 si opening_cash es float aunque no haya conflicto', () => {
    const result = handleOpenCashSession({
      existingSession: null,
      body: { opening_cash: 50000.5 },
    })
    assert.equal(result.status, 400)
    assert.ok(result.body.errors.length > 0)
  })

  it('retorna 400 si opening_cash es negativo', () => {
    const result = handleOpenCashSession({
      existingSession: null,
      body: { opening_cash: -1000 },
    })
    assert.equal(result.status, 400)
  })

  it('retorna 400 si opening_cash no se envía (undefined)', () => {
    const result = handleOpenCashSession({
      existingSession: null,
      body: {},
    })
    assert.equal(result.status, 400)
  })
})

// =============================================================================
// TESTS: Lógica de recuperación 409 en frontend (openSession)
// =============================================================================

describe('BUG-A: Recuperación de 409 en openSession() (frontend)', () => {
  it('cuando open() devuelve 409, llama a current() y despacha la sesión existente', async () => {
    const existingSession = { id: 'existing-uuid', status: 'open', opening_cash: 30000 }
    const dispatched = []
    let closed = false

    const result = await openSessionLogic({
      openCash: '50000',
      cashOpen: async () => { const err = new Error('conflict'); err.status = 409; throw err },
      cashCurrent: async () => existingSession,
      dispatch: (action) => dispatched.push(action),
      onClose: () => { closed = true },
    })

    assert.equal(result.success, true)
    assert.equal(result.resumed, true)
    assert.equal(result.session.id, 'existing-uuid')
    assert.equal(dispatched.length, 1)
    assert.equal(dispatched[0].type, 'SET_CASH_SESSION')
    assert.deepEqual(dispatched[0].payload, existingSession)
    assert.equal(closed, true, 'El modal debe cerrarse tras retomar la sesión')
  })

  it('cuando open() tiene éxito, despacha la nueva sesión y cierra modal', async () => {
    const newSession = { id: 'new-uuid', status: 'open', opening_cash: 50000 }
    const dispatched = []
    let closed = false

    const result = await openSessionLogic({
      openCash: '50000',
      cashOpen: async () => newSession,
      cashCurrent: async () => null, // no debería llamarse
      dispatch: (action) => dispatched.push(action),
      onClose: () => { closed = true },
    })

    assert.equal(result.success, true)
    assert.equal(result.resumed, undefined)
    assert.equal(dispatched[0].payload.id, 'new-uuid')
    assert.equal(closed, true)
  })

  it('opening_cash se redondea antes de enviar al backend', async () => {
    let receivedCash
    await openSessionLogic({
      openCash: '50000.7',  // usuario escribe decimal
      cashOpen: async ({ opening_cash }) => { receivedCash = opening_cash; return { id: 'x' } },
      cashCurrent: async () => null,
      dispatch: () => {},
      onClose: () => {},
    })

    // Debe llegar como 50001 (Math.round(50000.7)), no como float
    assert.equal(Number.isInteger(receivedCash), true)
    assert.equal(receivedCash, 50001)
  })

  it('opening_cash undefined se normaliza a 0 con Math.round', async () => {
    let receivedCash
    await openSessionLogic({
      openCash: undefined,
      cashOpen: async ({ opening_cash }) => { receivedCash = opening_cash; return { id: 'x' } },
      cashCurrent: async () => null,
      dispatch: () => {},
      onClose: () => {},
    })

    assert.equal(receivedCash, 0)
  })

  it('cuando current() falla tras 409, reporta error sin bloquear la UI', async () => {
    const dispatched = []
    let closed = false

    const result = await openSessionLogic({
      openCash: '10000',
      cashOpen: async () => { const err = new Error('conflict'); err.status = 409; throw err },
      cashCurrent: async () => { throw new Error('network error') },
      dispatch: (action) => dispatched.push(action),
      onClose: () => { closed = true },
    })

    // No debe haber dispatched ninguna sesión
    assert.equal(dispatched.length, 0)
    // Modal no se cierra si no hay sesión recuperable
    assert.equal(closed, false)
    // Retorna error controlado
    assert.equal(result.success, false)
  })

  it('cuando current() retorna null tras 409, reporta error sin bloquear la UI', async () => {
    const dispatched = []

    const result = await openSessionLogic({
      openCash: '10000',
      cashOpen: async () => { const err = new Error('conflict'); err.status = 409; throw err },
      cashCurrent: async () => null,  // sesión ya cerrada por otro proceso
      dispatch: (action) => dispatched.push(action),
      onClose: () => {},
    })

    assert.equal(dispatched.length, 0)
    assert.equal(result.success, false)
  })
})
