import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Suspense, lazy, Component } from 'react'

// --- Providers (orden importa: Auth → Plan → POS → Sync) ---
import { AuthProvider, useAuth } from './context/AuthContext'
import { PlanProvider, ModuleGuard, AdaptiveNav, PricingPage, TrialBanner } from './components/ModuleGuard'
import { POSProvider } from './context/POSContext'
import { SyncProvider } from './context/SyncContext'
import { OfflineBanner } from './components/OfflineBanner'
import { AIAssistant }  from './components/AIAssistant'

// --- Landing page pública ---
import LandingPage             from './pages/LandingPage'

// --- Auth pages (no lazy: se necesitan antes de autenticar) ---
import { LoginPage }           from './pages/auth/LoginPage'
import { RegisterPage,
         ForgotPasswordPage,
         ResetPasswordPage }   from './pages/auth/AuthScreens'
import { OnboardingWizard }    from './pages/auth/OnboardingWizard'
import { BranchSelector }      from './pages/auth/BranchSelector'

// --- Feature pages (lazy para code splitting) ---
// NOTA: páginas con "export default function" NO necesitan .then()
// Solo CustomersPage usa "export function" (named export)
const DashboardPage      = lazy(() => import('./pages/DashboardPage'))
const POSPage            = lazy(() => import('./pages/POSPage'))
const InventoryPage      = lazy(() => import('./pages/InventoryPage'))
const BarbershopPage     = lazy(() => import('./pages/BarbershopPage'))
const KitchenDisplayPage = lazy(() => import('./pages/KitchenDisplayPage'))
const WorkshopPage       = lazy(() => import('./pages/WorkshopPage'))
const MinimarketPage     = lazy(() => import('./pages/MinimarketPage'))
const CustomersPage      = lazy(() => import('./pages/CustomersPage').then(m => ({ default: m.CustomersPage })))
// CheckoutPage: tiene tanto named export como default export — usamos default
const CheckoutPage       = lazy(() => import('./pages/CheckoutPage'))
const DianPage           = lazy(() => import('./pages/DianPage'))
const ModulesPage        = lazy(() => import('./pages/ModulesPage'))

// ---------------------------------------------------------------------------
// ErrorBoundary global — evita pantalla blanca en errores no capturados
// ---------------------------------------------------------------------------
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-5 bg-gray-50 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-3xl">⚠️</div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Ocurrió un error inesperado</h2>
            <p className="text-sm text-gray-500 mt-1">Recarga la página para continuar.</p>
            {import.meta.env.DEV && (
              <pre className="mt-3 text-xs text-red-600 text-left bg-red-50 rounded p-3 max-w-md overflow-auto">
                {this.state.error?.toString()}
              </pre>
            )}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors">
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Fallback de carga mientras el chunk lazy se descarga
// ---------------------------------------------------------------------------
function PageSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center h-full bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-medium">Cargando módulo…</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProtectedRoute — redirige a /login si no hay sesión activa
// ---------------------------------------------------------------------------
function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo-ferzu.svg" alt="Ferzu" className="w-16 h-16 opacity-80" />
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}

// ---------------------------------------------------------------------------
// AppShell — layout principal: sidebar + contenido (para todas las páginas
//            EXCEPTO /pos que tiene su propio layout full-screen)
// NOTA: El PIN lock lo maneja AuthContext directamente como overlay z-50.
//       No necesitamos chequearlo aquí.
// ---------------------------------------------------------------------------
function AppShell() {
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <AdaptiveNav />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TrialBanner />
        <OfflineBanner />
        <main className="flex-1 overflow-auto">
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <AIAssistant />
    </div>
  )
}

// ---------------------------------------------------------------------------
// POSShell — contenedor standalone para el terminal POS.
// POSPage tiene su propio h-screen + sidebar interno, así que NO debe ir
// dentro de AppShell (doble sidebar, doble layout).
// El PIN lock lo maneja AuthContext directamente.
// ---------------------------------------------------------------------------
function POSShell() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
      <AIAssistant />
    </>
  )
}

// ---------------------------------------------------------------------------
// App — árbol de rutas completo
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <PlanProvider>
        <SyncProvider>
          <POSProvider>
            <Routes>
              {/* ====== Landing page pública ====== */}
              <Route path="/"                 element={<LandingPage />} />

              {/* ====== Rutas públicas ====== */}
              <Route path="/login"            element={<LoginPage />} />
              <Route path="/register"         element={<RegisterPage />} />
              <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
              <Route path="/reset-password"  element={<ResetPasswordPage />} />
              <Route path="/onboarding"       element={<OnboardingWizard />} />
              <Route path="/branch-select"    element={<BranchSelector />} />
              <Route path="/pricing"          element={<PricingPage />} />

              {/* ====== POS — full-screen standalone (sin AppShell) ====== */}
              <Route element={<ProtectedRoute />}>
                <Route element={<POSShell />}>
                  <Route path="/pos" element={
                    <ModuleGuard moduleKey="pos">
                      <Suspense fallback={<PageSpinner />}><POSPage /></Suspense>
                    </ModuleGuard>
                  } />
                </Route>
              </Route>

              {/* ====== Rutas protegidas con AppShell (sidebar + nav) ====== */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>

                  <Route path="/dashboard"
                    element={<ModuleGuard moduleKey="dashboard"><DashboardPage /></ModuleGuard>}
                  />
                  <Route path="/inventory"
                    element={<ModuleGuard moduleKey="inventory"><InventoryPage /></ModuleGuard>}
                  />
                  <Route path="/customers"
                    element={<ModuleGuard moduleKey="customers"><CustomersPage /></ModuleGuard>}
                  />
                  <Route path="/barbershop"
                    element={<ModuleGuard moduleKey="barbershop"><BarbershopPage /></ModuleGuard>}
                  />
                  <Route path="/kitchen"
                    element={<ModuleGuard moduleKey="kitchen"><KitchenDisplayPage /></ModuleGuard>}
                  />
                  <Route path="/workshop"
                    element={<ModuleGuard moduleKey="workshop"><WorkshopPage /></ModuleGuard>}
                  />
                  <Route path="/minimarket"
                    element={<ModuleGuard moduleKey="minimarket"><MinimarketPage /></ModuleGuard>}
                  />
                  <Route path="/dian"
                    element={<ModuleGuard moduleKey="dian"><DianPage /></ModuleGuard>}
                  />
                  <Route path="/modules"   element={<ModulesPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />

                </Route>
              </Route>

              {/* Catch-all — usuarios autenticados van al dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </POSProvider>
        </SyncProvider>
      </PlanProvider>
    </AuthProvider>
    </ErrorBoundary>
  )
}
