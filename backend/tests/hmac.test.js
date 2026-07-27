// =============================================================================
// FERZU POS — Tests de verificación HMAC para webhooks de Bold
//
// Reproduce la misma lógica que usa verifyBoldSignature() en server.js
// sin necesitar importar el servidor ni credenciales de Supabase.
// Regla de seguridad: el webhook DEBE rechazar cualquier firma inválida.
// =============================================================================
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

// Replica exacta de verifyBoldSignature() — si cambia en server.js, cambiar aquí también
function verifyBoldSignature(rawBody, signatureHeader, secret) {
  const sig = signatureHeader.replace(/^sha256=/, '')
  if (sig.length !== 64) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))
  } catch {
    return false
  }
}

const SECRET = 'clave-secreta-de-prueba-bold'
const BODY   = Buffer.from(JSON.stringify({ event: 'TRANSACTION_UPDATED', status: 'APPROVED' }))

describe('verifyBoldSignature — seguridad del webhook Bold', () => {
  it('acepta una firma HMAC-SHA256 válida con prefijo sha256=', () => {
    const hmac = crypto.createHmac('sha256', SECRET).update(BODY).digest('hex')
    assert.equal(verifyBoldSignature(BODY, `sha256=${hmac}`, SECRET), true)
  })

  it('acepta una firma sin prefijo sha256= (Bold no lo envía siempre)', () => {
    const hmac = crypto.createHmac('sha256', SECRET).update(BODY).digest('hex')
    assert.equal(verifyBoldSignature(BODY, hmac, SECRET), true)
  })

  it('rechaza una firma completamente incorrecta', () => {
    assert.equal(verifyBoldSignature(BODY, 'sha256=' + 'f'.repeat(64), SECRET), false)
  })

  it('rechaza si la firma tiene longitud incorrecta (no son 64 hex chars)', () => {
    assert.equal(verifyBoldSignature(BODY, 'sha256=abc123', SECRET), false)
    assert.equal(verifyBoldSignature(BODY, 'sha256=', SECRET), false)
  })

  it('rechaza si el body fue alterado (integridad de datos)', () => {
    const hmac = crypto.createHmac('sha256', SECRET).update(BODY).digest('hex')
    const alteredBody = Buffer.from(JSON.stringify({ event: 'TRANSACTION_UPDATED', status: 'DECLINED' }))
    assert.equal(verifyBoldSignature(alteredBody, `sha256=${hmac}`, SECRET), false)
  })

  it('rechaza si se usa una clave secreta incorrecta', () => {
    const hmac = crypto.createHmac('sha256', 'otra-clave-diferente').update(BODY).digest('hex')
    assert.equal(verifyBoldSignature(BODY, `sha256=${hmac}`, SECRET), false)
  })
})
