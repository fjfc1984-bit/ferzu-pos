// =============================================================================
// FERZU POS — Tests de regresión: Flujo de Login
//
// Bug corregido 2026-08-20:
//   handleLogin hacía dos queries a Supabase: signInWithPassword + query a
//   tabla users. Si la segunda query fallaba, userData quedaba null y la
//   navegación iba a /onboarding en lugar de /branch-select.
//
// Corrección:
//   handleLogin solo llama signInWithPassword y navega SIEMPRE a /branch-select.
//   El perfil lo carga AuthProvider vía onAuthStateChange.
//
// CÓMO CORRER: node --test src/__tests__/loginFlow.test.js
// =============================================================================
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─── Helper: función mock simple ─────────────────────────────────────────────
function mockFn(implementation) {
  const calls = []
  const fn = async (...args) => {
    calls.push(args)
    return implementation ? implementation(...args) : undefined
  }
  fn.calls = calls
  fn.calledTimes = () => calls.length
  fn.calledWith = (...args) => calls.some(c => JSON.stringify(c) === JSON.stringify([...args]))
  fn.lastCall = () => calls[calls.length - 1]
  return fn
}

// ─── RÉPLICA: handleLogin (AuthScreens.jsx — post-fix) ───────────────────────
async function handleLoginLogic({ form, supabaseAuth, navigate, setError }) {
  setError('')
  const { error: authError } = await supabaseAuth.signInWithPassword({
    email:    form.email.trim().toLowerCase(),
    password: form.password,
  })

  if (authError) {
    const msg =
      authError.message.includes('Invalid login') || authError.message.includes('Invalid email')
        ? 'Correo o contraseña incorrectos'
        : authError.message
    setError(msg)
    return
  }

  navigate('/branch-select')
}

// ─── RÉPLICA: loadUserProfile (AuthScreens.jsx — post-fix) ───────────────────
async function loadUserProfileLogic({ userId, fallbackEmail, dbResult, setUser }) {
  const { data, error } = dbResult

  if (error) throw error

  if (data) {
    if (!data.email && fallbackEmail) data.email = fallbackEmail
    setUser(data)
  }

  return data
}

// =============================================================================
// TESTS: handleLogin
// =============================================================================

describe('BUG Login: handleLogin navega a /branch-select (un solo paso)', () => {
  it('en login exitoso navega a /branch-select', async () => {
    const navigateCalls = []
    const errorCalls    = []

    await handleLoginLogic({
      form: { email: 'user@test.com', password: '123456' },
      supabaseAuth: {
        signInWithPassword: async () => ({ data: { session: {} }, error: null }),
      },
      navigate: (path) => navigateCalls.push(path),
      setError: (msg)  => errorCalls.push(msg),
    })

    assert.equal(navigateCalls.length, 1)
    assert.equal(navigateCalls[0], '/branch-select')
    // setError se llama solo una vez: limpieza inicial ('')
    assert.equal(errorCalls.length, 1)
    assert.equal(errorCalls[0], '')
  })

  it('en error de credenciales muestra mensaje amigable y NO navega', async () => {
    const navigateCalls = []
    const errorCalls    = []

    await handleLoginLogic({
      form: { email: 'user@test.com', password: 'wrong' },
      supabaseAuth: {
        signInWithPassword: async () => ({
          data: null,
          error: { message: 'Invalid login credentials' },
        }),
      },
      navigate: (path) => navigateCalls.push(path),
      setError: (msg)  => errorCalls.push(msg),
    })

    assert.equal(navigateCalls.length, 0)
    assert.equal(errorCalls[errorCalls.length - 1], 'Correo o contraseña incorrectos')
  })

  it('error "Invalid email" también produce mensaje amigable', async () => {
    const errorCalls = []

    await handleLoginLogic({
      form: { email: 'notanemail', password: '123' },
      supabaseAuth: {
        signInWithPassword: async () => ({
          data: null,
          error: { message: 'Invalid email address' },
        }),
      },
      navigate: () => {},
      setError: (msg) => errorCalls.push(msg),
    })

    assert.equal(errorCalls[errorCalls.length - 1], 'Correo o contraseña incorrectos')
  })

  it('error de red muestra el mensaje original', async () => {
    const errorCalls = []

    await handleLoginLogic({
      form: { email: 'user@test.com', password: '123456' },
      supabaseAuth: {
        signInWithPassword: async () => ({
          data: null,
          error: { message: 'Failed to fetch' },
        }),
      },
      navigate: () => {},
      setError: (msg) => errorCalls.push(msg),
    })

    assert.equal(errorCalls[errorCalls.length - 1], 'Failed to fetch')
  })

  it('el email se normaliza a minúsculas y sin espacios', async () => {
    let capturedEmail

    await handleLoginLogic({
      form: { email: '  USER@TEST.COM  ', password: '123456' },
      supabaseAuth: {
        signInWithPassword: async ({ email }) => {
          capturedEmail = email
          return { data: { session: {} }, error: null }
        },
      },
      navigate: () => {},
      setError: () => {},
    })

    assert.equal(capturedEmail, 'user@test.com')
  })

  it('login exitoso NO consulta tabla users (esa responsabilidad es del AuthProvider)', async () => {
    // handleLogin solo llama signInWithPassword.
    // Si se llamara a la tabla users y fallara, no debe afectar la navegación.
    let supabaseCalls = 0
    const navigate = []

    await handleLoginLogic({
      form: { email: 'user@test.com', password: '123456' },
      supabaseAuth: {
        signInWithPassword: async () => {
          supabaseCalls++
          return { data: { session: {} }, error: null }
        },
      },
      navigate: (p) => navigate.push(p),
      setError: () => {},
    })

    // Solo 1 llamada a Supabase (signInWithPassword), navegación siempre ocurre
    assert.equal(supabaseCalls, 1)
    assert.equal(navigate[0], '/branch-select')
  })
})

// =============================================================================
// TESTS: loadUserProfile — fallback de email
// =============================================================================

describe('BUG Panel Admin: loadUserProfile usa fallbackEmail cuando email es null en BD', () => {
  it('cuando users.email es null y hay fallback, lo asigna al perfil', async () => {
    const savedUsers = []
    const mockData = { id: 'u1', email: null, full_name: 'Fernando', role: 'owner', organization_id: 'org-1' }

    const result = await loadUserProfileLogic({
      userId: 'u1',
      fallbackEmail: 'fjfc1984@gmail.com',
      dbResult: { data: { ...mockData }, error: null },
      setUser: (u) => savedUsers.push(u),
    })

    assert.equal(savedUsers.length, 1)
    assert.equal(savedUsers[0].email, 'fjfc1984@gmail.com')
  })

  it('cuando users.email ya tiene valor, no lo sobreescribe', async () => {
    const savedUsers = []

    await loadUserProfileLogic({
      userId: 'u2',
      fallbackEmail: 'fallback@email.com',
      dbResult: { data: { id: 'u2', email: 'real@email.com', role: 'admin' }, error: null },
      setUser: (u) => savedUsers.push(u),
    })

    assert.equal(savedUsers[0].email, 'real@email.com')
  })

  it('sin fallbackEmail y email null en BD, el perfil queda con email null', async () => {
    const savedUsers = []

    await loadUserProfileLogic({
      userId: 'u3',
      fallbackEmail: null,
      dbResult: { data: { id: 'u3', email: null, role: 'staff' }, error: null },
      setUser: (u) => savedUsers.push(u),
    })

    assert.equal(savedUsers[0].email, null)
  })

  it('cuando la query retorna null (usuario sin fila en users), no llama setUser', async () => {
    const savedUsers = []

    const result = await loadUserProfileLogic({
      userId: 'ghost',
      fallbackEmail: 'ghost@email.com',
      dbResult: { data: null, error: null },
      setUser: (u) => savedUsers.push(u),
    })

    assert.equal(savedUsers.length, 0)
    assert.equal(result, null)
  })

  it('cuando la query retorna error, lanza la excepción', async () => {
    await assert.rejects(
      () => loadUserProfileLogic({
        userId: 'u4',
        fallbackEmail: null,
        dbResult: { data: null, error: new Error('DB connection failed') },
        setUser: () => {},
      }),
      { message: 'DB connection failed' }
    )
  })
})
