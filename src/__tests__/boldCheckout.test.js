// =============================================================================
// FERZU POS — Tests de boldCheckout.js
// Verifica que:
// 1. parseBoldRedirectResult() lee correctamente los parámetros de URL
// 2. startPlanPayment() incluye organizationId en la URL de Bold
//    (fix crítico: sin esto el webhook no sabe a qué org activar)
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseBoldRedirectResult, startPlanPayment } from '../lib/boldCheckout'

// Utilidad para simular la URL que Bold pone en el redirect
function mockSearch(params) {
  Object.defineProperty(window, 'location', {
    value: { search: params ? '?' + new URLSearchParams(params).toString() : '' },
    writable: true,
    configurable: true,
  })
}

// Utilidad para capturar el href al que redirige startPlanPayment
function mockLocationHref() {
  let captured = null
  Object.defineProperty(window, 'location', {
    value: {
      href: '',
      set href(val) { captured = val },
      get href() { return captured || '' },
      search: '',
      origin: 'https://ferzu-pos.vercel.app',
    },
    writable: true,
    configurable: true,
  })
  return { getHref: () => captured }
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

describe('startPlanPayment — organización incluida en la URL de Bold', () => {
  const ORG_ID  = 'abc-1234-org'
  const PLAN_ID = 'pro'

  beforeEach(() => {
    mockLocationHref()
  })

  it('incluye metadata[organization_id] en la URL de Bold', () => {
    startPlanPayment({ planId: PLAN_ID, organizationId: ORG_ID })
    const href = window.location.href
    expect(href).toBeTruthy()
    expect(href).toContain('organization_id')
    expect(href).toContain(ORG_ID)
  })

  it('incluye metadata[plan_id] en la URL de Bold', () => {
    startPlanPayment({ planId: PLAN_ID, organizationId: ORG_ID })
    const href = window.location.href
    expect(href).toContain('plan_id')
    expect(href).toContain(PLAN_ID)
  })

  it('incluye redirect_url para que Bold nos devuelva al cliente', () => {
    startPlanPayment({ planId: PLAN_ID, organizationId: ORG_ID })
    const href = window.location.href
    expect(href).toContain('redirect_url')
    expect(href).toContain('checkout/resultado')
  })

  it('la URL base es la del link de Bold correcto para "pro"', () => {
    startPlanPayment({ planId: 'pro', organizationId: ORG_ID })
    const href = window.location.href
    expect(href).toContain('checkout.bold.co')
    expect(href).toContain('LNK_I6ARFZ8T6Q') // link de "pro"
  })

  it('la URL base es la del link de Bold correcto para "pos_basic"', () => {
    startPlanPayment({ planId: 'pos_basic', organizationId: ORG_ID })
    const href = window.location.href
    expect(href).toContain('LNK_8DHFYQU0I9') // link de "pos_basic"
  })

  it('lanza error si planId no existe', () => {
    expect(() =>
      startPlanPayment({ planId: 'enterprise', organizationId: ORG_ID })
    ).toThrow('Plan no reconocido: enterprise')
  })

  it('lanza error si organizationId está vacío o ausente', () => {
    expect(() =>
      startPlanPayment({ planId: PLAN_ID, organizationId: '' })
    ).toThrow('organizationId requerido')

    expect(() =>
      startPlanPayment({ planId: PLAN_ID, organizationId: undefined })
    ).toThrow('organizationId requerido')
  })

  it('dos orgs diferentes generan URLs diferentes', () => {
    startPlanPayment({ planId: PLAN_ID, organizationId: 'org-A' })
    const hrefA = window.location.href

    mockLocationHref()
    startPlanPayment({ planId: PLAN_ID, organizationId: 'org-B' })
    const hrefB = window.location.href

    expect(hrefA).not.toBe(hrefB)
    expect(hrefA).toContain('org-A')
    expect(hrefB).toContain('org-B')
  })
})
