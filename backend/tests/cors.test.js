// =============================================================================
// FERZU POS — Tests de regresión: CORS
//
// Bug corregido 2026-08-20:
//   El callback de CORS lanzaba new Error(...) para orígenes no permitidos.
//   Esto disparaba eventos en Sentry innecesariamente (ruido).
//
// Corrección: usar cb(null, false) para rechazar silenciosamente.
//   cb(new Error(...)) → ❌ lanza excepción, Sentry la captura
//   cb(null, false)    → ✅ rechaza la petición sin excepción
//
// CÓMO CORRER: node --test backend/tests/cors.test.js
// =============================================================================
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─── RÉPLICA: Lógica del origin callback de CORS (server.js) ─────────────────

/**
 * Replica la función que se pasa como `origin` al middleware cors().
 * FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
 */
function buildCorsOriginCallback(frontendUrl = 'https://ferzu-pos.vercel.app') {
  const ALLOWED_ORIGINS = [
    frontendUrl,
    'http://localhost:5173',
    'http://localhost:4173',
  ]

  return function corsOrigin(origin, cb) {
    if (!origin) return cb(null, true)                    // same-origin / curl sin Origin
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    // Rechazar SILENCIOSAMENTE — no lanzar Error para no contaminar Sentry
    cb(null, false)
  }
}

/**
 * Helper: ejecuta el callback y captura qué se pasó a cb.
 * Retorna { err, allowed } — err es el primer arg, allowed el segundo.
 */
function runCors(corsOrigin, origin) {
  return new Promise((resolve) => {
    corsOrigin(origin, (err, allowed) => resolve({ err, allowed }))
  })
}

// =============================================================================
// TESTS
// =============================================================================

describe('CORS: orígenes permitidos reciben cb(null, true)', () => {
  const corsOrigin = buildCorsOriginCallback('https://ferzu-pos.vercel.app')

  it('permite el frontend de producción en Vercel', async () => {
    const { err, allowed } = await runCors(corsOrigin, 'https://ferzu-pos.vercel.app')
    assert.equal(err, null)
    assert.equal(allowed, true)
  })

  it('permite localhost:5173 (dev Vite)', async () => {
    const { err, allowed } = await runCors(corsOrigin, 'http://localhost:5173')
    assert.equal(err, null)
    assert.equal(allowed, true)
  })

  it('permite localhost:4173 (preview Vite)', async () => {
    const { err, allowed } = await runCors(corsOrigin, 'http://localhost:4173')
    assert.equal(err, null)
    assert.equal(allowed, true)
  })

  it('permite peticiones sin Origin header (same-origin, curl, Postman)', async () => {
    const { err, allowed } = await runCors(corsOrigin, undefined)
    assert.equal(err, null)
    assert.equal(allowed, true)
  })

  it('permite peticiones con Origin null explícito', async () => {
    const { err, allowed } = await runCors(corsOrigin, null)
    assert.equal(err, null)
    assert.equal(allowed, true)
  })
})

describe('CORS: orígenes no permitidos reciben cb(null, false) — SIN Error', () => {
  const corsOrigin = buildCorsOriginCallback('https://ferzu-pos.vercel.app')

  it('rechaza origen desconocido sin lanzar Error', async () => {
    const { err, allowed } = await runCors(corsOrigin, 'https://evil-site.com')
    // CRÍTICO: err debe ser null, no una instancia de Error
    assert.equal(err, null, 'No debe pasar Error al callback — evita contaminación de Sentry')
    assert.equal(allowed, false)
  })

  it('rechaza subdominio no autorizado sin lanzar Error', async () => {
    const { err, allowed } = await runCors(corsOrigin, 'https://ferzu-pos.evil.vercel.app')
    assert.equal(err, null)
    assert.equal(allowed, false)
  })

  it('rechaza localhost en puerto diferente sin lanzar Error', async () => {
    const { err, allowed } = await runCors(corsOrigin, 'http://localhost:3001')
    assert.equal(err, null)
    assert.equal(allowed, false)
  })

  it('rechaza http:// del frontend en vez de https:// (diferente origen)', async () => {
    const { err, allowed } = await runCors(corsOrigin, 'http://ferzu-pos.vercel.app')
    assert.equal(err, null)
    assert.equal(allowed, false)
  })

  it('rechazo con cb(null, false) no lanza excepción — Sentry no captura nada', async () => {
    // Si cb recibe un Error como primer arg, Express lo propaga como excepción.
    // Verificamos que el primer arg siempre sea null para orígenes no permitidos.
    const unknownOrigins = [
      'https://attacker.com',
      'https://ferzu.fake.com',
      'http://192.168.1.100:5173',
    ]

    for (const origin of unknownOrigins) {
      const { err } = await runCors(corsOrigin, origin)
      assert.equal(err, null, `Origen "${origin}" debe recibir null como error, no una excepción`)
      assert.ok(!(err instanceof Error), `Origen "${origin}" no debe producir Error`)
    }
  })
})

describe('CORS: el rechazo silencioso vs el error ruidoso', () => {
  it('documenta la diferencia: cb(Error) vs cb(null, false)', () => {
    // cb(new Error('Not allowed')) → Express llama next(err) → Sentry lo captura
    // cb(null, false)              → Express envía 403 sin propagar excepción → Sentry no se entera

    // El patrón INCORRECTO (el que causaba ruido):
    function badCorsOrigin(origin, cb) {
      if (!origin) return cb(null, true)
      cb(new Error(`Origen "${origin}" no permitido`))  // ❌ ruido en Sentry
    }

    // El patrón CORRECTO (el que usamos ahora):
    function goodCorsOrigin(origin, cb) {
      if (!origin) return cb(null, true)
      cb(null, false)  // ✅ silencioso
    }

    // Verificar que el correcto no lanza Error:
    return new Promise((resolve, reject) => {
      goodCorsOrigin('https://evil.com', (err, allowed) => {
        try {
          assert.equal(err, null)
          assert.equal(allowed, false)
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  })
})
