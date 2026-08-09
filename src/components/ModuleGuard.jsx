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
  Crown, ArrowRight, Star, Clock, AlertTriangle,
  RefreshCw, Shield, MessageCircle, ToggleLeft, Settings2,
  Building2, ChevronDown, BarChart2, BarChart3, Users, FileText
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
  const [plan,          setPlan]          = useState(null);
  const [modules,       setModules]       = useState(['pos']); // Mínimo garantizado
  const [activeModules, setActiveModules] = useState({});      // {} = todos activos
  const [trial,         setTrial]         = useState(null);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    if (!organizationId) { setLoading(false); return; }
    loadPlan();

    // Escuchar cambios de plan y active_modules en tiempo real
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
        setModules(org.enabled_modules   || ['pos']);
        setActiveModules(org.active_modules || {});
        if (org.trial_ends_at) setTrial(org.trial_ends_at);
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [organizationId]);

  async function loadPlan() {
    setLoading(true);
    const { data: org } = await supabase
      .from('organizations')
      .select('plan_id, enabled_modules, active_modules, trial_ends_at')
      .eq('id', organizationId)
      .single();

    if (org) {
      setPlan(FERZU_PLANS[org.plan_id] || FERZU_PLANS.free);
      setModules(org.enabled_modules   || ['pos']);
      setActiveModules(org.active_modules || {});
      if (org.trial_ends_at) setTrial(org.trial_ends_at);
    }
    setLoading(false);
  }

  return (
    <PlanContext.Provider value={{ plan, modules, activeModules, trial, loading, refetch: loadPlan }}>
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

/**
 * Hook que verifica acceso a un módulo.
 * Distingue 3 estados:
 *   enabled:         el módulo está activo (plan OK + owner no lo desactivó)
 *   disabledByOwner: el plan lo incluye pero el owner lo desactivó
 *   lockedByPlan:    el plan no incluye este módulo → UpgradeWall
 */
export function useModule(moduleKey) {
  const { modules, activeModules, plan, trial, loading } = usePlan();

  // Durante el trial activo → todos los módulos están disponibles
  const isInTrial = trial && new Date(trial) > new Date();

  const inPlan         = isInTrial || hasModule(modules, moduleKey);
  const ownerDisabled  = activeModules?.[moduleKey] === false;
  return {
    enabled:         !loading && inPlan && !ownerDisabled,
    disabledByOwner: !loading && inPlan && ownerDisabled,
    lockedByPlan:    !loading && !inPlan,
    isInTrial,
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
  const { enabled, disabledByOwner, plan, loading } = useModule(moduleKey);
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

  // Módulo en plan pero desactivado por el dueño → DisabledWall
  if (disabledByOwner) {
    return <DisabledWall moduleMeta={meta} />;
  }

  // Módulo no incluido en el plan → UpgradeWall
  if (!enabled) {
    return <UpgradeWall moduleKey={moduleKey} moduleMeta={meta} currentPlan={plan} />;
  }

  return children;
}


// =============================================================================
// DisabledWall — Módulo en plan pero desactivado por el dueño
// =============================================================================

function DisabledWall({ moduleMeta }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="max-w-sm w-full mx-4 text-center">
        <div className="relative inline-flex mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center text-4xl">
            {moduleMeta?.icon || '📦'}
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center shadow-lg">
            <ToggleLeft size={14} className="text-white" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {moduleMeta?.label || 'Módulo'} desactivado
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Este módulo está incluido en tu plan pero lo has desactivado. Puedes volver a habilitarlo desde la configuración de módulos.
        </p>
        <button
          onClick={() => navigate('/modules')}
          className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors">
          Ir a Configuración de módulos
        </button>
      </div>
    </div>
  );
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

  const NICHO_PLANS = ['barbershop', 'restaurant', 'workshop', 'minimarket'];

  const nichoMeta = {
    barbershop: { emoji: '💈', color: 'purple', border: 'border-purple-200', badge: 'bg-purple-50 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700 text-white', tag: 'Barberías & Spas' },
    restaurant:  { emoji: '🍔', color: 'orange', border: 'border-orange-200', badge: 'bg-orange-50 text-orange-700', btn: 'bg-orange-500 hover:bg-orange-600 text-white', tag: 'Restaurantes & Cafés' },
    workshop:    { emoji: '🔧', color: 'yellow', border: 'border-yellow-200', badge: 'bg-yellow-50 text-yellow-700', btn: 'bg-yellow-500 hover:bg-yellow-600 text-white', tag: 'Talleres mecánicos' },
    minimarket:  { emoji: '🛒', color: 'green',  border: 'border-green-200',  badge: 'bg-green-50 text-green-700',  btn: 'bg-green-600 hover:bg-green-700 text-white',  tag: 'Minimarkets & Tiendas' },
  };

  // Tabla comparativa vs competencia
  const COMP_ROWS = [
    { feat: 'Precio/mes',            ferzu: '$79k–$149k',  alegra: '$26k–$200k', siigo: '$146k+',    loggro: '$109k' },
    { feat: 'Módulos por nicho',     ferzu: '✅ 6 nichos', alegra: '❌',         siigo: '❌',         loggro: '⚠️ Solo rest.' },
    { feat: 'IA asistente',          ferzu: '✅ Plan Pro',  alegra: '❌',         siigo: '❌',         loggro: '❌' },
    { feat: 'Offline-first',         ferzu: '✅',           alegra: '❌',         siigo: '❌',         loggro: '⚠️ Parcial' },
    { feat: 'DIAN en todos los planes', ferzu: '✅',        alegra: '✅',         siigo: '✅',         loggro: '✅' },
    { feat: 'KDS cocina',            ferzu: '✅',           alegra: '❌',         siigo: '❌',         loggro: '✅' },
    { feat: 'Barbería / Citas',      ferzu: '✅',           alegra: '❌',         siigo: '❌',         loggro: '❌' },
    { feat: 'Taller / OT',           ferzu: '✅',           alegra: '❌',         siigo: '❌',         loggro: '❌' },
    { feat: 'Multi-sucursal',        ferzu: '✅ Plan Pro',  alegra: '💰 +$80k',   siigo: '💰 +plan',  loggro: '✅' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── HERO ── */}
      <div className="bg-gradient-to-br from-gray-950 via-gray-900 to-brand-950 text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-brand-500/20 border border-brand-500/30 rounded-full px-4 py-1.5 text-xs text-brand-300 font-medium mb-6">
            <Sparkles size={12} />
            14 días de prueba gratis · Sin tarjeta de crédito
          </div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">
            El POS más completo de Colombia,<br/>al precio más justo
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Un sistema especializado para tu tipo de negocio. No pagas por funciones que no usas.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-8 text-sm text-gray-400">
            {['✓ DIAN UBL 2.1 incluido', '✓ Funciona sin internet', '✓ IA integrada en Plan Pro', '✓ Soporte por WhatsApp'].map(t => (
              <span key={t} className="text-brand-300">{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">

        {/* ── PLAN GRATIS ── */}
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-6">
            <div className="shrink-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Para empezar</p>
              <p className="text-2xl font-bold text-gray-900">FERZU Gratis</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">$0 <span className="text-sm font-normal text-gray-400">/ mes</span></p>
              <p className="text-xs text-green-600 mt-0.5">✓ Para siempre · Sin vencimiento</p>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
              {['POS básico', 'Hasta 50 productos', '1 usuario', '1 sucursal'].map(f => (
                <span key={f} className="flex items-center gap-1"><CheckCircle2 size={11} className="text-green-500" />{f}</span>
              ))}
              {['Sin DIAN', 'Sin IA', 'Sin nichos especializados'].map(f => (
                <span key={f} className="flex items-center gap-1 text-gray-400"><X size={11} className="text-gray-300" />{f}</span>
              ))}
            </div>
            <button
              onClick={() => navigate('/register')}
              className="shrink-0 px-6 py-2.5 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-xl transition-colors">
              Empezar gratis
            </button>
          </div>
        </div>

        {/* ── PLANES POR NICHO ── */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Planes especializados por nicho</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {NICHO_PLANS.map(planId => {
            const plan  = FERZU_PLANS[planId];
            const meta  = nichoMeta[planId];
            const isCurrent = currentPlan?.id === planId;
            return (
              <div key={planId} className={`bg-white rounded-2xl border-2 ${meta.border} p-5 flex flex-col hover:shadow-md transition-shadow`}>
                <div className={`text-[11px] font-semibold px-2 py-0.5 rounded-full self-start mb-3 ${meta.badge}`}>
                  {meta.emoji} {meta.tag}
                </div>
                <p className="font-bold text-gray-900 text-base">{plan.name}</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {formatCOP(plan.price_cop)} <span className="text-xs font-normal text-gray-400">/mes</span>
                </p>
                <div className="flex-1 mt-4 space-y-1.5">
                  {plan.enabled_modules.map(mKey => {
                    const m = MODULE_META[mKey];
                    if (!m) return null;
                    return (
                      <div key={mKey} className="flex items-center gap-2 text-xs text-gray-700">
                        <CheckCircle2 size={11} className="text-green-500 shrink-0" />
                        <span>{m.icon} {m.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 bg-gray-50 rounded-xl p-2.5 space-y-0.5 text-[10px] text-gray-500 mb-4">
                  <div className="flex justify-between"><span>Productos</span><strong className="text-gray-700">{plan.max_products}</strong></div>
                  <div className="flex justify-between"><span>Usuarios</span><strong className="text-gray-700">{plan.max_users}</strong></div>
                  <div className="flex justify-between"><span>Sucursales</span><strong className="text-gray-700">{plan.max_branches}</strong></div>
                </div>
                {isCurrent ? (
                  <div className="w-full py-2 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold rounded-xl text-center">✓ Tu plan actual</div>
                ) : (
                  <button onClick={() => navigate(`/checkout?plan=${planId}`)}
                    className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-colors ${meta.btn}`}>
                    {plan.cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── PLAN PRO ── */}
        <div className="bg-gradient-to-r from-brand-600 to-emerald-600 rounded-2xl p-1 mb-12">
          <div className="bg-gray-950 rounded-xl p-7">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
              <div className="flex-1">
                <div className="inline-flex items-center gap-1.5 bg-brand-500/20 text-brand-300 text-xs font-semibold px-3 py-1 rounded-full mb-3">
                  <Sparkles size={11} /> ⚡ Plan más completo · Todo incluido
                </div>
                <h2 className="text-2xl font-bold text-white">FERZU Pro</h2>
                <p className="text-gray-400 text-sm mt-1">Todos los módulos + IA Claude + DIAN + hasta 3 sucursales</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 mt-4">
                  {FERZU_PLANS.pro.enabled_modules.map(mKey => {
                    const m = MODULE_META[mKey];
                    if (!m) return null;
                    return (
                      <div key={mKey} className="flex items-center gap-1.5 text-xs text-gray-300">
                        <CheckCircle2 size={11} className="text-brand-400" />{m.icon} {m.label}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="shrink-0 text-center lg:text-right">
                <p className="text-gray-400 text-sm line-through">$200.000/mes</p>
                <p className="text-4xl font-bold text-white">$149.000 <span className="text-base font-normal text-gray-400">/mes</span></p>
                <p className="text-xs text-brand-400 mt-1">Hasta 20 usuarios · 3 sucursales · 10.000 productos</p>
                <button
                  onClick={() => navigate('/checkout?plan=pro')}
                  className="mt-4 px-8 py-3 bg-brand-500 hover:bg-brand-400 text-white font-bold rounded-xl transition-colors shadow-lg shadow-brand-500/30">
                  Empezar Pro ahora
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── COMPARATIVA VS COMPETENCIA ── */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-gray-900 mb-1">¿Por qué FERZU y no Alegra, Siigo o Loggro?</h2>
          <p className="text-sm text-gray-500 mb-6">Comparación objetiva · Precios verificados julio 2026</p>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left p-4 text-xs font-semibold text-gray-400 uppercase tracking-wide w-1/3">Característica</th>
                  <th className="p-4 text-center bg-brand-50 text-brand-700 font-bold text-xs">FERZU POS</th>
                  <th className="p-4 text-center text-gray-500 font-medium text-xs">Alegra POS</th>
                  <th className="p-4 text-center text-gray-500 font-medium text-xs">Siigo</th>
                  <th className="p-4 text-center text-gray-500 font-medium text-xs">Loggro</th>
                </tr>
              </thead>
              <tbody>
                {COMP_ROWS.map((row, i) => (
                  <tr key={row.feat} className={i % 2 === 0 ? 'bg-gray-50/40' : ''}>
                    <td className="p-3.5 pl-4 text-xs font-medium text-gray-700">{row.feat}</td>
                    <td className="p-3.5 text-center text-xs font-semibold text-brand-700 bg-brand-50/50">{row.ferzu}</td>
                    <td className="p-3.5 text-center text-xs text-gray-500">{row.alegra}</td>
                    <td className="p-3.5 text-center text-xs text-gray-500">{row.siigo}</td>
                    <td className="p-3.5 text-center text-xs text-gray-500">{row.loggro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">* Alegra Emprendedor $25.900, plan con DIAN desde $79.900. Siigo plan profesional anual $145.993/mes + módulo POS adicional.</p>
        </div>

        {/* ── GARANTÍAS ── */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {[
            { icon: <RefreshCw size={20} />, title: 'Cancela cuando quieras', desc: 'Sin permanencia mínima. Cancela con un clic.' },
            { icon: <Shield size={20} />,    title: '14 días de prueba gratis', desc: 'Prueba el plan Pro completo sin pagar nada.' },
            { icon: <MessageCircle size={20} />, title: 'Soporte por WhatsApp', desc: 'Equipo humano. Respuesta en menos de 2 horas.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl border border-gray-200 p-5 flex gap-4 items-start">
              <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">{icon}</div>
              <div>
                <p className="font-semibold text-sm text-gray-900">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── ENTERPRISE ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Para cadenas y franquicias</p>
            <h3 className="text-xl font-bold text-gray-900">FERZU Enterprise</h3>
            <p className="text-sm text-gray-500 mt-1">Sucursales ilimitadas, API REST, white-label, onboarding dedicado y SLA garantizado.</p>
          </div>
          <button
            onClick={() => window.open('https://wa.me/573000000000?text=Hola, quiero información sobre FERZU Enterprise', '_blank')}
            className="shrink-0 px-6 py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-xl text-sm transition-colors">
            Contactar ventas →
          </button>
        </div>

      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 5.5: BranchSwitcher — Selector in-app de sucursal (admin/owner)
// Permite cambiar de sucursal sin cerrar sesión.
// Solo visible para roles admin/owner. Cajeros solo ven el nombre.
// =============================================================================

function BranchSwitcher({ isAdmin }) {
  const [open,     setOpen]     = useState(false);
  const [branches, setBranches] = useState([]);
  const [loading,  setLoading]  = useState(false);

  const [currentName, setCurrentName] = useState(
    localStorage.getItem('ferzu_branch_name') || ''
  );
  const currentId = localStorage.getItem('ferzu_branch_id');

  // Auto-cargar nombre si branch_id existe pero branch_name no está guardado
  useEffect(() => {
    if (currentName || !currentId) return;
    supabase
      .from('branches')
      .select('name')
      .eq('id', currentId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) {
          localStorage.setItem('ferzu_branch_name', data.name);
          setCurrentName(data.name);
        }
      });
  }, [currentId]);

  async function loadBranches() {
    if (branches.length > 0) { setOpen(o => !o); return; }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('user_branches')
        .select('branches(id, name, city, is_active)')
        .eq('user_id', user.id);
      const active = (data || []).map(r => r.branches).filter(b => b?.is_active);
      setBranches(active);
    } finally {
      setLoading(false);
      setOpen(true);
    }
  }

  function switchBranch(branch) {
    if (branch.id === currentId) { setOpen(false); return; }
    localStorage.setItem('ferzu_branch_id',   branch.id);
    localStorage.setItem('ferzu_branch_name', branch.name);
    setOpen(false);
    // Recarga para reinicializar POSContext, SyncContext, etc. con la nueva sucursal
    window.location.href = '/pos';
  }

  // Cajeros: solo etiqueta read-only
  if (!isAdmin) {
    return (
      <div className="px-4 pt-1 pb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <Building2 size={11} className="text-white/30 shrink-0" />
          <span className="text-[10px] text-white/40 truncate">{currentName || 'Sucursal'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-2 pt-1 pb-2 border-b border-white/10">
      <button
        onClick={loadBranches}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors group">
        <Building2 size={12} className="text-white/40 shrink-0" />
        <span className="flex-1 text-left text-[11px] text-white/60 group-hover:text-white/90 truncate font-medium">
          {currentName || 'Sucursal'}
        </span>
        {loading
          ? <RefreshCw size={10} className="text-white/30 animate-spin shrink-0" />
          : <ChevronDown size={10} className="text-white/30 group-hover:text-white/60 shrink-0" />
        }
      </button>

      {open && branches.length > 0 && (
        <>
          {/* Overlay cierra el dropdown */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-2 right-2 top-full mt-1 bg-gray-900 border border-white/20 rounded-xl shadow-2xl z-50 overflow-hidden">
            <p className="text-[9px] text-white/30 uppercase tracking-widest px-3 pt-2 pb-1 font-semibold">
              Cambiar sucursal
            </p>
            {branches.map(branch => {
              const isCurrent = branch.id === currentId;
              return (
                <button
                  key={branch.id}
                  onClick={() => switchBranch(branch)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    isCurrent
                      ? 'bg-brand-700/40 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}>
                  <Building2 size={11} className={isCurrent ? 'text-brand-400' : 'text-white/30'} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{branch.name}</p>
                    {branch.city && <p className="text-[9px] text-white/30">{branch.city}</p>}
                  </div>
                  {isCurrent && (
                    <span className="text-[9px] text-brand-400 shrink-0">actual</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// SECCIÓN 6: AdaptiveNav — Menú lateral adaptativo por plan
// Reemplaza el menú fijo. Solo muestra los módulos del plan activo.
// =============================================================================

export function AdaptiveNav({ currentPath: currentPathProp }) {
  const { modules, activeModules, plan, trial } = usePlan();
  const { user, signOut }                       = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const currentPath = currentPathProp ?? location.pathname;

  const isAdmin = ['admin', 'owner'].includes(user?.role);

  // Conteo de alertas no resueltas para badge del nav
  const [alertCount, setAlertCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    import('../lib/api').then(({ default: api }) => {
      api.get('/alerts/summary')
        .then(r => setAlertCount(r.data?.total || 0))
        .catch(() => {});
    });
  }, [user, currentPath]); // refrescar al navegar

  // Durante trial activo → todos los módulos son accesibles en el nav
  const isInTrial = trial && new Date(trial) > new Date();
  const ALL_MAIN = ['pos', 'barbershop', 'kitchen', 'workshop', 'minimarket', 'inventory', 'dashboard'];
  const effectiveModules = isInTrial ? ALL_MAIN : modules;

  // Módulos habilitados por plan Y no desactivados por el dueño
  const navModules = getNavModules(effectiveModules)
    .filter(mod => activeModules?.[mod.key] !== false);

  // Módulos que NO tiene el plan → upgrade hint (máx 3); vacío durante trial
  const lockedModules = isInTrial ? [] : ALL_MAIN
    .filter(key => !modules.includes(key))
    .map(key => MODULE_META[key])
    .filter(Boolean)
    .slice(0, 3);

  return (
    <aside className="hidden md:flex md:w-56 bg-gray-950 flex-col h-full shrink-0">

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

      {/* Selector de sucursal */}
      <BranchSwitcher isAdmin={isAdmin} />

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

      {/* Links visibles para todos los usuarios */}
      <div className="px-2 pb-1 space-y-0.5">
        <Link
          to="/analytics"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
            currentPath?.startsWith('/analytics')
              ? 'bg-white/20 text-white'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          }`}>
          <BarChart3 size={13} />
          <span>Analíticas</span>
        </Link>
        <Link
          to="/reporte"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
            currentPath?.startsWith('/reporte')
              ? 'bg-white/20 text-white'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          }`}>
          <BarChart2 size={13} />
          <span>Reporte diario</span>
        </Link>
        <Link
          to="/turnos"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
            currentPath?.startsWith('/turnos')
              ? 'bg-white/20 text-white'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          }`}>
          <Clock size={13} />
          <span>Mis turnos</span>
        </Link>
      </div>

      {/* Panel super-admin — solo Fernando */}
      {user?.email === 'fjfc1984@gmail.com' && (
        <div className="px-2 pb-1">
          <Link
            to="/admin"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              currentPath === '/admin'
                ? 'bg-brand-600/80 text-white'
                : 'text-brand-300/70 hover:text-brand-200 hover:bg-brand-600/20'
            }`}>
            <Users size={13} />
            <span>Panel Admin</span>
          </Link>
        </div>
      )}

      {/* Enlaces de configuración — solo admins */}
      {isAdmin && (
        <div className="px-2 pb-2 space-y-0.5">
          <Link
            to="/sucursales"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              currentPath === '/sucursales'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}>
            <Building2 size={13} />
            <span>Sucursales</span>
          </Link>
          <Link
            to="/modules"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              currentPath === '/modules'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}>
            <Settings2 size={13} />
            <span>Configurar módulos</span>
          </Link>
          <Link
            to="/settings"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              currentPath === '/settings'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}>
            <Settings2 size={13} />
            <span>Configuración</span>
          </Link>
          <Link
            to="/restaurant/tables"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              currentPath?.startsWith('/restaurant/tables')
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}>
            <span className="text-sm leading-none">🪑</span>
            <span>Mapa de mesas</span>
          </Link>
          <Link
            to="/integraciones"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              currentPath?.startsWith('/integraciones')
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}>
            <span className="text-sm leading-none">🔌</span>
            <span>Integraciones</span>
          </Link>
          <Link
            to="/alertas"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              currentPath?.startsWith('/alertas')
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}>
            <Shield size={13} />
            <span className="flex-1">Alertas</span>
            {alertCount > 0 && (
              <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </Link>
          <Link
            to="/retencion"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              currentPath?.startsWith('/retencion')
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}>
            <span className="text-sm leading-none">💛</span>
            <span>Retención</span>
          </Link>
          <Link
            to="/dian"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              currentPath?.startsWith('/dian')
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}>
            <FileText size={13} />
            <span>Facturación DIAN</span>
          </Link>
        </div>
      )}

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
// SECCIÓN 8: MobileBottomNav — Barra de navegación inferior (solo mobile)
// Visible en pantallas < md (768px). En md+ el sidebar cubre la navegación.
// =============================================================================

export function MobileBottomNav() {
  const { modules, activeModules, plan, trial } = usePlan();
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();
  const currentPath = location.pathname;

  const isAdmin   = ['admin', 'owner'].includes(user?.role);
  const isInTrial = trial && new Date(trial) > new Date();
  const ALL_MAIN  = ['pos','barbershop','kitchen','workshop','minimarket','inventory','dashboard'];
  const effective = isInTrial ? ALL_MAIN : modules;

  const navModules = getNavModules(effective)
    .filter(mod => activeModules?.[mod.key] !== false)
    .slice(0, 4); // máx 4 módulos + botón "más"

  // Ítem activo
  const isActive = (route) => currentPath?.startsWith(route);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-950 border-t border-white/10
                    flex items-stretch safe-area-inset-bottom">
      {/* Módulos principales */}
      {navModules.map(mod => (
        <button
          key={mod.key}
          onClick={() => navigate(mod.route)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
            isActive(mod.route)
              ? 'text-brand-400'
              : 'text-white/40 hover:text-white/70'
          }`}>
          <span className="text-lg leading-none">{mod.icon}</span>
          <span className="text-[9px] font-medium truncate max-w-[56px] text-center leading-tight">
            {mod.label}
          </span>
        </button>
      ))}

      {/* Dashboard siempre presente si hay espacio */}
      {!navModules.some(m => m.key === 'dashboard') && (
        <button
          onClick={() => navigate('/dashboard')}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
            isActive('/dashboard') ? 'text-brand-400' : 'text-white/40 hover:text-white/70'
          }`}>
          <span className="text-lg leading-none">📊</span>
          <span className="text-[9px] font-medium">Dashboard</span>
        </button>
      )}

      {/* Botón "Más" → reporte / ajustes */}
      <button
        onClick={() => navigate(isAdmin ? '/modules' : '/reporte')}
        className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
          (isActive('/modules') || isActive('/reporte')) ? 'text-brand-400' : 'text-white/40 hover:text-white/70'
        }`}>
        <span className="text-lg leading-none">⋯</span>
        <span className="text-[9px] font-medium">Más</span>
      </button>
    </nav>
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
