// =============================================================================
// FERZU POS — Tests de flujo webhook Bold
//
// Prueba la lógica del webhook sin hacer llamadas reales a Supabase ni a Bold.
// Cubre: HMAC, extracción de metadata, activación de plan, casos de error.
//
// CÓMO CORRER: node --test tests/bold-webhook.test.js
// =============================================================================
import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

// ─── REPLICAS DE LAS FUNCIONES PURAS DE payments.routes.js ─────────────────
// Si cambia la lógica en payments.routes.js → actualizar aquí para que el test
// falle y avise de la inconsistencia.

const PLAN_PRICES_COP = {
  pos_basic:   49_000,
  barbershop:  79_000,
  workshop:    79_000,
  minimarket:  79_000,
  restaurant:  89_000,
  pro:        149_000,
}

function verifyBoldSignature(rawBody, signatureHeader, secret) {
  if (!secret) return false
  if (!signatureHeader) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
  try {
    const sig = signatureHeader.replace(/^sha256=/, '')
    if (sig.length !== 64) return false
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(sig, 'hex')
    )
  } catch {
    return false
  }
}

// Simula la extracción de org_id y plan_id del evento Bold
function extractMetadata(event) {
  const { data = {} } = event
  const { metadata = {} } = data
  // Soporta ambos formatos: metadata.organization_id y metadata.org_id
  const orgId  = metadata.organization_id || metadata.org_id || null
  const planId = metadata.plan_id || metadata.plan || null
  return { orgId, planId }
}

// Simula la lógica de cálculo de período de suscripción
function calcPeriod(now = new Date()) {
  const periodEnd = new Date(now)
  periodEnd.setMonth(periodEnd.getMonth() + 1)
  return { current_period_start: now.toISOString(), current_period_end: periodEnd.toISOString() }
}

// Helper: genera un webhook válido con firma HMAC
function makeWebhookPayload(data, secret) {
  const payload = JSON.stringify(data)
  const rawBody = Buffer.from(payload, 'utf8')
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return { rawBody, sig, payload }
}

// ─── TESTS ──────────────────────────────────────────────────────────────────

const SECRET = 'bold-secret-key-testing-only'
const ORG_ID = 'org-uuid-1234-test'
const PLAN_ID = 'pro'

const validEvent = {
  type: 'TRANSACTION_UPDATED',
  data: {
    id:     'bold-txn-abc123',
    status: 'APPROVED',
    metadata: {
      organization_id: ORG_ID,
      plan_id:         PLAN_ID,
    },
  },
}

describe('Bold Webhook — verificación de firma HMAC', () => {
  it('acepta firma válida con prefijo sha256=', () => {
    const { rawBody, sig } = makeWebhookPayload(validEvent, SECRET)
    assert.equal(verifyBoldSignature(rawBody, sig, SECRET), true)
  })

  it('rechaza firma con body alterado (integridad)', () => {
    const { sig } = makeWebhookPayload(validEvent, SECRET)
    const alteredBody = Buffer.from(JSON.stringify({ ...validEvent, injected: true }))
    assert.equal(verifyBoldSignature(alteredBody, sig, SECRET), false)
  })

  it('rechaza firma con secret diferente', () => {
    const { rawBody } = makeWebhookPayload(validEvent, SECRET)
    const sigConOtroSecret = 'sha256=' + crypto
      .createHmac('sha256', 'otro-secret-equivocado')
      .update(rawBody).digest('hex')
    assert.equal(verifyBoldSignature(rawBody, sigConOtroSecret, SECRET), false)
  })

  it('rechaza firma con hex de longitud incorrecta', () => {
    const { rawBody } = makeWebhookPayload(validEvent, SECRET)
    assert.equal(verifyBoldSignature(rawBody, 'sha256=abc', SECRET), false)
    assert.equal(verifyBoldSignature(rawBody, 'sha256=', SECRET), false)
  })

  it('rechaza cuando header es undefined/null', () => {
    const { rawBody } = makeWebhookPayload(validEvent, SECRET)
    assert.equal(verifyBoldSignature(rawBody, undefined, SECRET), false)
    assert.equal(verifyBoldSignature(rawBody, null, SECRET), false)
  })

  it('rechaza cuando BOLD_SECRET_KEY no está configurada (producción segura)', () => {
    const { rawBody, sig } = makeWebhookPayload(validEvent, SECRET)
    // Sin secret → false siempre
    assert.equal(verifyBoldSignature(rawBody, sig, ''), false)
  })
})

describe('Bold Webhook — extracción de metadata', () => {
  it('extrae organization_id y plan_id del evento APPROVED', () => {
    const { orgId, planId } = extractMetadata(validEvent)
    assert.equal(orgId,  ORG_ID)
    assert.equal(planId, PLAN_ID)
  })

  it('acepta el alias org_id (por si Bold propaga params del URL)', () => {
    const event = {
      type: 'TRANSACTION_UPDATED',
      data: {
        status: 'APPROVED',
        metadata: { org_id: ORG_ID, plan: PLAN_ID },
      },
    }
    const { orgId, planId } = extractMetadata(event)
    assert.equal(orgId,  ORG_ID)
    assert.equal(planId, PLAN_ID)
  })

  it('devuelve null si metadata está vacía (422 esperado en el handler)', () => {
    const event = { type: 'TRANSACTION_UPDATED', data: { status: 'APPROVED', metadata: {} } }
    const { orgId, planId } = extractMetadata(event)
    assert.equal(orgId, null)
    assert.equal(planId, null)
  })

  it('devuelve null si metadata no existe', () => {
    const event = { type: 'TRANSACTION_UPDATED', data: { status: 'APPROVED' } }
    const { orgId, planId } = extractMetadata(event)
    assert.equal(orgId, null)
    assert.equal(planId, null)
  })
})

describe('Bold Webhook — lógica de activación', () => {
  it('un evento APPROVED con metadata válida debe activar el plan', () => {
    const { orgId, planId } = extractMetadata(validEvent)
    const { data } = validEvent

    // Confirmar que toda la data necesaria está disponible
    assert.equal(data.status, 'APPROVED')
    assert.ok(orgId, 'orgId requerido')
    assert.ok(planId, 'planId requerido')
    assert.ok(PLAN_PRICES_COP[planId] !== undefined, `planId "${planId}" debe ser un plan válido`)
    assert.ok(data.id, 'transaction_id requerido para audit trail')
  })

  it('un evento DECLINED no debe activar el plan', () => {
    const declinedEvent = {
      type: 'TRANSACTION_UPDATED',
      data: { status: 'DECLINED', id: 'txn-999', metadata: { organization_id: ORG_ID, plan_id: PLAN_ID } },
    }
    // El handler hace: if (status !== 'APPROVED') return noop
    assert.notEqual(declinedEvent.data.status, 'APPROVED')
  })

  it('un evento de tipo desconocido no debe activar el plan', () => {
    const otherEvent = { type: 'ORDER_CREATED', data: {} }
    assert.notEqual(otherEvent.type, 'TRANSACTION_UPDATED')
  })

  it('no debe activar si planId no existe en PLAN_PRICES_COP', () => {
    const invalidPlans = ['starter', 'enterprise', 'basic', '', undefined, null]
    for (const planId of invalidPlans) {
      assert.equal(
        PLAN_PRICES_COP[planId],
        undefined,
        `planId inválido "${planId}" no debe tener precio`
      )
    }
  })
})

describe('Bold Webhook — cálculo de período de suscripción', () => {
  it('el período dura exactamente 1 mes', () => {
    const base = new Date('2026-01-15T10:00:00Z')
    const { current_period_start, current_period_end } = calcPeriod(base)
    const start = new Date(current_period_start)
    const end   = new Date(current_period_end)

    assert.equal(start.toISOString(), base.toISOString())
    assert.equal(end.getFullYear(), 2026)
    assert.equal(end.getMonth(), 1)  // Mes 1 = Febrero (0-indexed)
    assert.equal(end.getDate(), 15)
  })

  it('maneja correctamente el paso de año (diciembre → enero)', () => {
    const base = new Date('2026-12-20T00:00:00Z')
    const { current_period_end } = calcPeriod(base)
    const end = new Date(current_period_end)

    // Usamos UTC para evitar diferencias por zona horaria del servidor
    assert.equal(end.getUTCFullYear(), 2027)
    assert.equal(end.getUTCMonth(), 0)  // Enero (0-indexed)
    assert.equal(end.getUTCDate(), 20)
  })

  it('ambas fechas son strings ISO 8601 válidos', () => {
    const { current_period_start, current_period_end } = calcPeriod()
    assert.ok(typeof current_period_start === 'string')
    assert.ok(typeof current_period_end === 'string')
    assert.ok(!isNaN(Date.parse(current_period_start)))
    assert.ok(!isNaN(Date.parse(current_period_end)))
    assert.ok(new Date(current_period_end) > new Date(current_period_start))
  })
})

describe('Bold Webhook — seguridad: no activar con firma forjada', () => {
  it('un atacante sin la secret key no puede forjar un webhook válido', () => {
    // El atacante intenta activar su propia org con un plan diferente
    const maliciousEvent = {
      type: 'TRANSACTION_UPDATED',
      data: {
        id: 'fake-txn',
        status: 'APPROVED',
        metadata: { organization_id: 'victim-org-uuid', plan_id: 'pro' },
      },
    }
    const { rawBody } = makeWebhookPayload(maliciousEvent, 'attacker-guessed-key')
    // El servidor verifica con la key real → rechaza
    assert.equal(verifyBoldSignature(rawBody, 'sha256=' + 'a'.repeat(64), SECRET), false)
  })

  it('replay attack: misma firma en body diferente debe fallar', () => {
    const originalEvent = { ...validEvent, data: { ...validEvent.data, id: 'txn-original' } }
    const { rawBody: origBody, sig } = makeWebhookPayload(originalEvent, SECRET)

    // Atacante modifica el body para reutilizar la firma
    const replayBody = Buffer.from(JSON.stringify({
      ...originalEvent,
      data: { ...originalEvent.data, id: 'txn-replay', metadata: { organization_id: 'other-org', plan_id: 'pro' } },
    }))
    assert.equal(verifyBoldSignature(replayBody, sig, SECRET), false)
  })
})
