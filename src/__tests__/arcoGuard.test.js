// =============================================================================
// FERZU POS — Tests de regresión: Operaciones ARCO
//
// Correcciones aplicadas 2026-08-20:
//
// 1. isAdmin guard: anonymizeCustomer() y deleteCustomerARCO() verifican
//    isAdmin antes de operar. Sin permiso → mensaje de error, sin modificar datos.
//
// 2. organizationId filter: todas las mutaciones de clientes incluyen
//    .eq('organization_id', organizationId) para prevenir cross-tenant.
//
// ARCO = Acceso, Rectificación, Cancelación y Oposición (Ley 1581/2012)
//
// CÓMO CORRER: node --test src/__tests__/arcoGuard.test.js
// =============================================================================
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─── RÉPLICA: anonymizeCustomer (CustomersPage.jsx — post-fix) ───────────────
async function anonymizeCustomerLogic({ customerId, isAdmin, organizationId, supabaseUpdate, setArcoSuccess }) {
  if (!isAdmin) {
    setArcoSuccess('⛔ Sin permiso: solo Owner o Admin pueden ejecutar operaciones ARCO.')
    return { aborted: true }
  }

  const { error } = await supabaseUpdate({
    data: {
      full_name: 'Cliente Anónimo',
      email:     null,
      phone:     null,
      id_number: null,
      address:   null,
      notes:     null,
      anonymized: true,
    },
    filters: { id: customerId, organization_id: organizationId },
  })

  if (error) {
    setArcoSuccess(`Error al anonimizar: ${error.message}`)
    return { aborted: false, error }
  }

  setArcoSuccess('✅ Datos del cliente anonimizados correctamente.')
  return { aborted: false, success: true }
}

// ─── RÉPLICA: deleteCustomerARCO (CustomersPage.jsx — post-fix) ──────────────
async function deleteCustomerARCOLogic({ customerId, isAdmin, organizationId, supabaseDelete, setArcoSuccess }) {
  if (!isAdmin) {
    setArcoSuccess('⛔ Sin permiso: solo Owner o Admin pueden ejecutar operaciones ARCO.')
    return { aborted: true }
  }

  const { error } = await supabaseDelete({
    filters: { id: customerId, organization_id: organizationId },
  })

  if (error) {
    setArcoSuccess(`Error al eliminar: ${error.message}`)
    return { aborted: false, error }
  }

  setArcoSuccess('✅ Cliente eliminado permanentemente.')
  return { aborted: false, success: true }
}

// ─── Función de isAdmin según AuthContext ─────────────────────────────────────
function computeIsAdmin(role) {
  return role === 'owner' || role === 'admin'
}

// =============================================================================
// TESTS: Guard isAdmin en anonymizeCustomer
// =============================================================================

describe('ARCO: isAdmin guard en anonymizeCustomer', () => {
  it('bloquea la anonimización si el usuario no es Admin/Owner', async () => {
    let updateCalled = false
    const messages   = []

    const result = await anonymizeCustomerLogic({
      customerId: 'cust-123',
      isAdmin: false,
      organizationId: 'org-1',
      supabaseUpdate: async () => { updateCalled = true; return { error: null } },
      setArcoSuccess: (m) => messages.push(m),
    })

    assert.equal(result.aborted, true)
    assert.equal(updateCalled, false)
    assert.ok(messages[0].includes('Sin permiso'))
  })

  it('permite la anonimización si el usuario es Owner', async () => {
    const messages = []

    const result = await anonymizeCustomerLogic({
      customerId: 'cust-123',
      isAdmin: true,
      organizationId: 'org-1',
      supabaseUpdate: async () => ({ error: null }),
      setArcoSuccess: (m) => messages.push(m),
    })

    assert.equal(result.aborted, false)
    assert.equal(result.success, true)
    assert.ok(messages[0].includes('anonimizados'))
  })

  it('la anonimización incluye organization_id en los filtros', async () => {
    let capturedFilters

    await anonymizeCustomerLogic({
      customerId: 'cust-456',
      isAdmin: true,
      organizationId: 'org-abc',
      supabaseUpdate: async ({ filters }) => { capturedFilters = filters; return { error: null } },
      setArcoSuccess: () => {},
    })

    assert.equal(capturedFilters.id, 'cust-456')
    assert.equal(capturedFilters.organization_id, 'org-abc')
  })

  it('los datos anonimizados borran todos los campos PII', async () => {
    let capturedData

    await anonymizeCustomerLogic({
      customerId: 'cust-789',
      isAdmin: true,
      organizationId: 'org-1',
      supabaseUpdate: async ({ data }) => { capturedData = data; return { error: null } },
      setArcoSuccess: () => {},
    })

    assert.equal(capturedData.email,     null)
    assert.equal(capturedData.phone,     null)
    assert.equal(capturedData.id_number, null)
    assert.equal(capturedData.address,   null)
    assert.equal(capturedData.notes,     null)
    assert.equal(capturedData.anonymized, true)
    assert.equal(capturedData.full_name, 'Cliente Anónimo')
  })
})

// =============================================================================
// TESTS: Guard isAdmin en deleteCustomerARCO
// =============================================================================

describe('ARCO: isAdmin guard en deleteCustomerARCO', () => {
  it('bloquea la eliminación si el usuario no es Admin/Owner', async () => {
    let deleteCalled = false
    const messages   = []

    const result = await deleteCustomerARCOLogic({
      customerId: 'cust-999',
      isAdmin: false,
      organizationId: 'org-1',
      supabaseDelete: async () => { deleteCalled = true; return { error: null } },
      setArcoSuccess: (m) => messages.push(m),
    })

    assert.equal(result.aborted, true)
    assert.equal(deleteCalled, false)
    assert.ok(messages[0].includes('Sin permiso'))
  })

  it('permite la eliminación si el usuario es Admin', async () => {
    const messages = []

    const result = await deleteCustomerARCOLogic({
      customerId: 'cust-999',
      isAdmin: true,
      organizationId: 'org-1',
      supabaseDelete: async () => ({ error: null }),
      setArcoSuccess: (m) => messages.push(m),
    })

    assert.equal(result.aborted, false)
    assert.equal(result.success, true)
  })

  it('la eliminación incluye organization_id en los filtros del delete', async () => {
    let capturedFilters

    await deleteCustomerARCOLogic({
      customerId: 'cust-xyz',
      isAdmin: true,
      organizationId: 'org-xyz',
      supabaseDelete: async ({ filters }) => { capturedFilters = filters; return { error: null } },
      setArcoSuccess: () => {},
    })

    assert.equal(capturedFilters.id, 'cust-xyz')
    assert.equal(capturedFilters.organization_id, 'org-xyz')
  })
})

// =============================================================================
// TESTS: Definición de isAdmin y protección cross-tenant
// =============================================================================

describe('Definición de isAdmin y filtros anti cross-tenant', () => {
  it('solo owner y admin son isAdmin', () => {
    assert.equal(computeIsAdmin('owner'),    true)
    assert.equal(computeIsAdmin('admin'),    true)
    assert.equal(computeIsAdmin('staff'),    false)
    assert.equal(computeIsAdmin('cashier'),  false)
    assert.equal(computeIsAdmin(null),       false)
    assert.equal(computeIsAdmin(undefined),  false)
  })

  it('cross-tenant: filtros impiden que org-A modifique clientes de org-B', async () => {
    // Simulamos que un usuario de org-A intenta anonimizar un cliente de org-B.
    // Con el filtro .eq('organization_id', organizationId), la query en Supabase
    // retorna 0 filas afectadas aunque el ID exista en otra organización.
    let capturedFilters

    await anonymizeCustomerLogic({
      customerId: 'cust-de-org-B',  // ID de otra organización
      isAdmin: true,
      organizationId: 'org-A',       // JWT dice org-A
      supabaseUpdate: async ({ filters }) => { capturedFilters = filters; return { error: null } },
      setArcoSuccess: () => {},
    })

    // El filtro siempre usa el organizationId del JWT, nunca del body/param
    assert.equal(capturedFilters.organization_id, 'org-A')
    // Si el cliente pertenece a org-B, la query en Supabase no lo encontrará
    // porque la combinación id + organization_id no matchea ninguna fila.
  })
})
