// =============================================================================
// FERZU POS — Tests de boldCheckout.js
// Verifica que parseBoldRedirectResult() lee correctamente los parámetros de URL
// que Bold devuelve tras un pago (sin hacer llamadas reales a la API).
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest'
import { parseBoldRedirectResult } from '../lib/boldCheckout'

// Utilidad para simular la URL que Bold pone en el redirect
function mockSearch(params) {
  Object.defineProperty(window, 'location', {
    value: { search: params ? '?' + new URLSearchParams(params).toString() : '' },
    writable: true,
    configurable: true,
  })
}

describe('parseBoldRedirectResult', () => {
  beforeEach(() => {
    mockSearch(null)
  })

  it('devuelve nulls cuando no hay parámetros', () => {
    const result = parseBoldRedirectResult()
    expect(result.orderId).toBeNull()
    expect(result.status).toBeNull()
    expect(result.payment).toBeNull()
  })

  it('parsea correctamente un pago APPROVED', () => {
    mockSearch({ 'order-id': 'abc-123', status: 'APPROVED', payment: 'success' })
    const result = parseBoldRedirectResult()
    expect(result.orderId).toBe('abc-123')
    expect(result.status).toBe('APPROVED')
    expect(result.payment).toBe('success')
  })

  it('parsea correctamente un pago DECLINED', () => {
    mockSearch({ 'order-id': 'xyz-999', status: 'DECLINED' })
    const result = parseBoldRedirectResult()
    expect(result.orderId).toBe('xyz-999')
    expect(result.status).toBe('DECLINED')
    expect(result.payment).toBeNull()  // Bold no envía "payment" si falla
  })

  it('parsea correctamente un pago PENDING', () => {
    mockSearch({ 'order-id': 'pnd-555', status: 'PENDING' })
    const result = parseBoldRedirectResult()
    expect(result.status).toBe('PENDING')
  })

  it('es inmune a parámetros extra desconocidos', () => {
    mockSearch({ 'order-id': 'a1', status: 'APPROVED', 'extra-param': 'ignored' })
    const result = parseBoldRedirectResult()
    expect(result.orderId).toBe('a1')
    expect(result.status).toBe('APPROVED')
  })
})
