// =============================================================================
// FERZU POS — SISTEMA DE CONTROL DE ACCESO POR MÓDULO
// Archivo: src/lib/module_guard.jsx
// =============================================================================
// COMPONENTES:
//   1. usePlan()           — Hook: plan activo + módulos habilitados de la org
//   2. useModule(key)      — Hook: ¿tengo acceso a este módulo?
//   3. ModuleGuard         — Wrapper: renderiza el módulo o el UpgradeWall
//   4. UpgradeWall         — Pantalla de upgrade cuando no tiene el módulo
//   5. PricingPage         — Página pública de planes y precios
//   6. AdaptiveNav         — Menú lateral que solo muestra módulos del plan
//   7. TrialBanner         — Banner de días restantes de trial
// =============================================================================

import React, { useState, useEffect, useContext, createContext } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Lock, Zap, CheckCircle2, X, ChevronRight, Sparkles,
  Crown, ArrowRight, Star, Clock, AlertTriangle
} from 'lucide-react';
import { supabase }  from '../lib/supabase.js';
import { useAuth }   from '../context/AuthContext.jsx';
import {
  FERZU_PLANS, MODULE_META, hasModule, getNavModules, getUpgradePath
} from '../lib/plansConfig.js';
import { formatCOP } from '../lib/math.js';
import { differenceInDays, parseISO } from 'date-fns';

// =============================================================================
// SECCIÓN 1: PlanContext — Estado global del plan
// =============================================================================

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const { organizationId } = useAuth();
  const [plan,    setPlan]    = useState(null);
  const [modules, setModules] = useState(['pos']); // Mínimo garantizado
  const [trial,   setTrial]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) { setLoading(false); return; }
    loadPlan();

    // Escuchar cambios de plan en tiempo real (webhook de pago actualiza la BD)
    const ch = supabase
      .channel(`plan:${organizationId}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'organizations',
        filter: `id=eq.${organizationId}`,
      }, (payload) => {
        const org = payload.new;
        setPlan(FERZU_PLANS[org.plan_id] || FERZU_PLANS.free);
        setModules(org.enabled_modules || ['pos']);
        if (org.trial_ends_at) setTrial(org.trial_ends_at);
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [organizationId]);

  async function loadPlan() {
    setLoading(true);
    const { data: org } = await supabase
      .from('organizations')
      .select('plan_id, enabled_modules, trial_ends_at')
      .eq('id', organizationId)
      .single();

    if (org) {
      setPlan(FERZU_PLANS[org.plan_id] || FERZU_PLANS.free);
      setModules(org.enabled_modules || ['pos']);
      if (org.trial_ends_at) setTrial(org.trial_ends_at);
    }
    setLoading(false);
  }

  return (
    <PlanContext.Provider value={{ plan, modules, trial, loading, refetch: loadPlan }}>
      {children}
    </PlanContext.Provider>
  );
}


// =============================================================================
// SECCIÓN 2: Hooks de acceso
// =============================================================================

/** Hook que retorna el plan activo y los módulos habilitados */
export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be inside PlanProvider');
  return ctx;
}

/** Hook que verifica si la org tiene acceso a un módulo específico */
export function useModule(moduleKey) {
  const { modules, plan, loading } = usePlan();
  return {
    enabled: !loading && hasModule(modules, moduleKey),
    plan,
    loading,
  };
}


// =============================================================================
// SECCIÓN 3: ModuleGuard — Wrapper que protege cada página por módulo
// =============================================================================

/**
 * Envuelve cualquier página con protección de acceso por módulo.
 *
 * Uso:
 *   <ModuleGuard moduleKey="barbershop">
 *     <BarbershopPage />
 *   </ModuleGuard>
 *
 * Si el módulo no está en el plan → muestra UpgradeWall.
 * Si está cargando → muestra spinner.
 * Si tiene acceso → renderiza children.
 */
export function ModuleGuard({ moduleKey, children }) {
  const { enabled, plan, loading } = useModule(moduleKey);
  const meta = MODULE_META[moduleKey];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  if (!enabled) {
    return <UpgradeWall moduleKey={moduleKey} moduleMeta={meta} currentPlan={plan} />;
  }

  return children;
}


// =============================================================================
// SECCIÓN 4: UpgradeWall — Pantalla de upgrade atractiva
// =============================================================================

function UpgradeWall({ moduleKey, moduleMeta, currentPlan }) {
  const navigate = useNavigate();
  const upgradePlans = getUpgradePath(currentPlan?.id || 'free', moduleKey);

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-lg w-full mx-4 text-center">

        {/* Ícono del módulo bloqueado */}
        <div className="relative inline-flex mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gray-200 flex items-center justify-center text-4xl opacity-40">
            {moduleMeta?.icon || '🔒'}
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shadow-lg">
            <Lock size={14} className="text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {moduleMeta?.label || 'Módulo'} no incluido
        </h1>
        <p className="text-gray-500 mb-2">
          {moduleMeta?.description || 'Este módulo no está disponible en tu plan actual.'}
        </p>
        <p className="text-sm text-gray-400 mb-8">
          Plan actual: <span className="font-semibold text-gray-600">{currentPlan?.name || 'Gratis'}</span>
        </p>

        {/* Planes de upgrade sugeridos */}
        {upgradePlans.length > 0 && (
          <div className="space-y-3 mb-6">
            {upgradePlans.map((plan, i) => (
              <div
                key={plan.id}
                className={`border-2 rounded-2xl p-4 text-left transition-all hover:shadow-md cursor-pointer ${
                  i === 0
                    ? 'border-brand-400 bg-brand-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => navigate(`/upgrade?plan=${plan.id}&module=${moduleKey}`)}>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900">{plan.name}</span>
                      {i === 0 && (
                        <span className="text-[10px] bg-brand-500 text-white px-2 py-0.5 rounded-full font-bold">
                          RECOMENDADO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{plan.tagline}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {plan.enabled_modules.slice(0, 5).map(m => (
                        <span key={m} className="text-[10px] bg-white border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
                          {MODULE_META[m]?.icon} {MODULE_META[m]?.label || m}
                        </span>
                      ))}
                      {plan.enabled_modules.length > 5 && (
                        <span className="text-[10px] text-gray-400">+{plan.enabled_modules.length - 5} más</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-bold text-lg text-brand-700">
                      {plan.price_cop ? formatCOP(plan.price_cop) : 'A medida'}
                    </p>
                    {plan.price_cop && <p className="text-[10px] text-gray-400">/mes</p>}
                    <ChevronRight size={16} className="text-gray-400 mt-1 ml-auto" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/pricing')}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl flex items-center gap-2 transition-colors">
            <Zap size={15} />
            Ver todos los planes
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium rounded-xl transition-colors">
            Volver
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          ¿Preguntas? Escríbenos al{' '}
          <a href="https://wa.me/573000000000" target="_blank" rel="noreferrer"
            className="text-green-600 hover:underline">
            WhatsApp
          </a>
        </p>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 5: PricingPage — Página pública de planes y precios
// Ruta: /pricing
// =============================================================================

export function PricingPage() {
  const { plan: currentPlan } = usePlan();
  const navigate = useNavigate();

  const SHOW_PLANS = ['free', 'pos_basic', 'barbershop', 'restaurant', 'workshop', 'minimarket', 'pro'];

  const planColorMap = {
    gray:   { border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-700',  btn: 'bg-gray-800 hover:bg-gray-900 text-white' },
    blue:   { border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',  btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
    purple: { border: 'border-purple-300', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700 text-white' },
    orange: { border: 'border-orange-300', badge: 'bg-orange-100 text-orange-700', btn: 'bg-orange-500 hover:bg-orange-600 text-white' },
    yellow: { border: 'border-yellow-300', badge: 'bg-yellow-100 text-yellow-700', btn: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
    green:  { border: 'border-green-300',  badge: 'bg-green-100 text-green-700', btn: 'bg-green-600 hover:bg-green-700 text-white' },
    brand:  { border: 'border-brand-400',  badge: 'bg-brand-100 text-brand-700', btn: 'bg-brand-600 hover:bg-brand-700 text-white' },
    dark:   { border: 'border-gray-400',   badge: 'bg-gray-800 text-white',      btn: 'bg-gray-900 hover:bg-black text-white' },
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-full px-4 py-1.5 text-xs text-brand-700 font-medium mb-4">
            <Sparkles size={12} />
            Elige el plan ideal para tu negocio
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Precios simples y transparentes
          </h1>
          <p className="text-gray-500 max-w-lg mx-auto">
            Paga solo por lo que necesitas. Sin costos ocultos. Cancela cuando quieras.
            Todos los planes incluyen <strong>14 días de prueba gratis</strong>.
          </p>
        </div>

        {/* Grid de planes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {SHOW_PLANS.map(planId => {
            const plan   = FERZU_PLANS[planId];
            const colors = planColorMap[plan.color] || planColorMap.gray;
            const isCurrent = currentPlan?.id === planId;

            return (
              <div
                key={planId}
                className={`bg-white rounded-3xl border-2 p-5 flex flex-col transition-all hover:shadow-lg ${
                  plan.highlight ? colors.border + ' shadow-md' : 'border-gray-200'
                }`}>

                {/* Badge */}
                {plan.badge && (
                  <div className={`text-[10px] font-bold px-2 py-1 rounded-full self-start mb-3 ${colors.badge}`}>
                    {plan.badge}
                  </div>
                )}

                {/* Nombre y precio */}
                <div className="mb-4">
                  <h3 className="font-bold text-gray-900 text-lg leading-tight">{plan.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{plan.tagline}</p>
                  <div className="mt-3">
                    <span className="text-2xl font-bold text-gray-900">
                      {plan.price_cop ? formatCOP(plan.price_cop) : 'A medida'}
                    </span>
                    {plan.price_cop != null && (
                      <span className="text-xs text-gray-400 ml-1">/mes</span>
                    )}
                    {plan.price_cop === 0 && (
                      <p className="text-xs text-green-600 font-medium mt-0.5">✓ Gratis para siempre</p>
                    )}
                  </div>
                </div>

                {/* Módulos incluidos */}
                <div className="flex-1 space-y-1.5 mb-4">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-2">Incluye</p>
                  {plan.enabled_modules.map(mKey => {
                    const m = MODULE_META[mKey];
                    if (!m) return null;
                    return (
                      <div key={mKey} className="flex items-center gap-2 text-xs text-gray-700">
                        <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                        <span>{m.icon} {m.label}</span>
                      </div>
                    );
                  })}

                  {/* Limitaciones */}
                  {plan.limitations?.map((lim, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                      <X size={11} className="text-gray-300 shrink-0" />
                      <span>{lim}</span>
                    </div>
                  ))}
                </div>

                {/* Límites */}
                <div className="bg-gray-50 rounded-xl p-2.5 mb-4 space-y-1">
                  {[
                    ['Productos', plan.max_products],
                    ['Usuarios',  plan.max_users],
                    ['Sucursales',plan.max_branches],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-[10px] text-gray-500">
                      <span>{label}</span>
                      <strong className="text-gray-700">{val == null ? 'Ilimitados' : val}</strong>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                {isCurrent ? (
                  <div className="w-full py-2.5 bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-xl text-center">
                    ✓ Tu plan actual
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (planId === 'enterprise') {
                        window.open('https://wa.me/573000000000?text=Hola, quiero información sobre el plan Enterprise de FERZU POS', '_blank');
                      } else {
                        navigate(`/checkout?plan=${planId}`);
                      }
                    }}
                    className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-colors ${colors.btn}`}>
                    {plan.cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* FAQ / Garantía */}
        <div className="mt-12 grid md:grid-cols-3 gap-6 text-center">
          {[
            { icon: '🔄', title: 'Cancela cuando quieras', desc: 'Sin permanencia ni penalizaciones.' },
            { icon: '🔒', title: 'Datos seguros',         desc: 'Encriptación y backups diarios.' },
            { icon: '💬', title: 'Soporte por WhatsApp',  desc: 'Respuesta en menos de 2 horas.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl p-4 border border-gray-200">
              <div className="text-2xl mb-2">{icon}</div>
              <p className="font-semibold text-sm text-gray-900">{title}</p>
              <p className="text-xs text-gray-500 mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 6: AdaptiveNav — Menú lateral adaptativo por plan
// Reemplaza el menú fijo. Solo muestra los módulos del plan activo.
// =============================================================================

export function AdaptiveNav({ currentPath: currentPathProp }) {
  const { modules, plan, trial } = usePlan();
  const { user, signOut }        = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  // Usar prop si se pasa, sino derivar de react-router
  const currentPath = currentPathProp ?? location.pathname;

  const navModules = getNavModules(modules);

  // Módulos que NO tiene el plan pero existen → mostrar bloqueados como upgrade hint
  const ALL_MAIN = ['pos', 'barbershop', 'kitchen', 'workshop', 'minimarket', 'inventory', 'dashboard'];
  const lockedModules = ALL_MAIN
    .filter(key => !modules.includes(key))
    .map(key => MODULE_META[key])
    .filter(Boolean)
    .slice(0, 3); // Mostrar máximo 3 sugerencias

  return (
    <aside className="w-56 bg-gray-950 flex flex-col h-full shrink-0">

      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-none">FERZU POS</p>
            <p className="text-[10px] text-brand-400 mt-0.5">{plan?.name || 'Gratis'}</p>
          </div>
        </div>
      </div>

      {/* Trial banner dentro del nav */}
      {trial && (
        <TrialBannerCompact trialEndsAt={trial} onUpgrade={() => navigate('/pricing')} />
      )}

      {/* Módulos habilitados */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <p className="text-[9px] text-white/30 uppercase tracking-widest px-2 mb-2 font-semibold">Módulos activos</p>

        {navModules.map(mod => {
          const isActive = currentPath?.startsWith(mod.route);
          return (
            <Link
              key={mod.key}
              to={mod.route}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-0.5 transition-all group ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}>
              <span className="text-base leading-none">{mod.icon}</span>
              <span className="font-medium">{mod.label}</span>
            </Link>
          );
        })}

        {/* Módulos bloqueados (upgrade hints) */}
        {lockedModules.length > 0 && (
          <>
            <p className="text-[9px] text-white/20 uppercase tracking-widest px-2 mt-4 mb-2 font-semibold">
              Desbloquear
            </p>
            {lockedModules.map(mod => (
              <button
                key={mod.key}
                onClick={() => navigate(`/pricing?module=${mod.key}`)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-0.5 text-white/25 hover:text-white/50 hover:bg-white/5 transition-all group">
                <span className="text-base leading-none opacity-40">{mod.icon}</span>
                <span className="flex-1 text-left font-medium">{mod.label}</span>
                <Lock size={10} className="opacity-30 group-hover:opacity-60" />
              </button>
            ))}

            <button
              onClick={() => navigate('/pricing')}
              className="w-full mt-2 px-3 py-1.5 text-[10px] text-brand-400 hover:text-brand-300 text-left flex items-center gap-1 transition-colors">
              <Zap size={10} />
              Ver todos los planes
            </button>
          </>
        )}
      </nav>

      {/* Footer del nav */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/10 cursor-pointer transition-colors group">
          <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold text-white">
            {user?.full_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{user?.full_name || 'Usuario'}</p>
            <p className="text-[10px] text-white/40 capitalize">{user?.role || 'cajero'}</p>
          </div>
          <button
            onClick={signOut}
            className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white transition-all text-xs">
            ↩
          </button>
        </div>
      </div>
    </aside>
  );
}


// =============================================================================
// SECCIÓN 7: TrialBanner — Banner de días restantes del trial
// =============================================================================

/** Banner compacto dentro del nav */
function TrialBannerCompact({ trialEndsAt, onUpgrade }) {
  const daysLeft = differenceInDays(parseISO(trialEndsAt), new Date());
  if (daysLeft < 0) return null;

  return (
    <button
      onClick={onUpgrade}
      className={`mx-2 mt-2 mb-1 px-3 py-2 rounded-xl text-left transition-all ${
        daysLeft <= 3
          ? 'bg-red-900/30 border border-red-700/50 hover:bg-red-900/50'
          : 'bg-amber-900/30 border border-amber-700/50 hover:bg-amber-900/50'
      }`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Clock size={11} className={daysLeft <= 3 ? 'text-red-400' : 'text-amber-400'} />
        <span className={`text-[10px] font-bold ${daysLeft <= 3 ? 'text-red-400' : 'text-amber-400'}`}>
          Trial: {daysLeft === 0 ? 'Expira HOY' : `${daysLeft} día${daysLeft !== 1 ? 's' : ''}`}
        </span>
      </div>
      <p className="text-[9px] text-white/40 flex items-center gap-1">
        Activar plan <ArrowRight size={8} />
      </p>
    </button>
  );
}

/** Banner grande en la parte superior (para páginas que no usan nav) */
export function TrialBanner() {
  const { trial, plan } = usePlan();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (!trial || dismissed) return null;
  const daysLeft = differenceInDays(parseISO(trial), new Date());
  if (daysLeft < 0) return null;

  return (
    <div className={`flex items-center gap-3 px-4 py-2 text-sm shrink-0 ${
      daysLeft <= 3 ? 'bg-red-600' : 'bg-amber-500'
    } text-white`}>
      <Clock size={14} className="shrink-0" />
      <span className="flex-1">
        {daysLeft === 0
          ? '⚠️ Tu trial vence HOY. '
          : `Tu trial de ${plan?.name} vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}. `}
        <button onClick={() => navigate('/pricing')} className="underline font-semibold hover:no-underline">
          Activar plan ahora
        </button>
      </span>
      <button onClick={() => setDismissed(true)} className="text-white/70 hover:text-white">
        <X size={14} />
      </button>
    </div>
  );
}


// =============================================================================
// INTEGRACIÓN EN App.jsx — Cómo usar todo esto
// =============================================================================
/*
// En src/main.jsx — agregar PlanProvider al árbol de providers:
// QueryClientProvider → BrowserRouter → AuthProvider → PlanProvider → SyncProvider → POSProvider → App

// En src/App.jsx — envolver cada ruta sensible con ModuleGuard:
import { ModuleGuard, AdaptiveNav, TrialBanner, PricingPage } from '../lib/module_guard.jsx';

function AppLayout() {
  const location = useLocation();
  return (
    <div className="flex h-screen overflow-hidden">
      <AdaptiveNav currentPath={location.pathname} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TrialBanner />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Rutas protegidas por módulo:
<Route element={<AppLayout />}>
  <Route path="/pos" element={
    <ModuleGuard moduleKey="pos">
      <POSPage />
    </ModuleGuard>
  } />
  <Route path="/barbershop" element={
    <ModuleGuard moduleKey="barbershop">
      <BarbershopPage />
    </ModuleGuard>
  } />
  <Route path="/kitchen" element={
    <ModuleGuard moduleKey="kitchen">
      <KitchenDisplayPage />
    </ModuleGuard>
  } />
  <Route path="/workshop" element={
    <ModuleGuard moduleKey="workshop">
      <WorkshopPage />
    </ModuleGuard>
  } />
  <Route path="/minimarket" element={
    <ModuleGuard moduleKey="minimarket">
      <MinimarketPage />
    </ModuleGuard>
  } />
  <Route path="/inventory" element={
    <ModuleGuard moduleKey="inventory">
      <InventoryPage />
    </ModuleGuard>
  } />
  <Route path="/dashboard" element={
    <ModuleGuard moduleKey="dashboard">
      <DashboardPage />
    </ModuleGuard>
  } />
  <Route path="/ai" element={
    <ModuleGuard moduleKey="ai">
      <AIPage />
    </ModuleGuard>
  } />
</Route>

// Ruta pública de precios (sin guard):
<Route path="/pricing"  element={<PricingPage />} />
<Route path="/checkout" element={<CheckoutPage />} />
*/
