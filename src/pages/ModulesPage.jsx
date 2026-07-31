// =============================================================================
// FERZU POS — Página de Configuración de Módulos
// Archivo: src/pages/ModulesPage.jsx
// Solo visible para admin/owner.
// Permite activar/desactivar módulos dentro de los límites del plan.
// Módulos no incluidos en el plan → badge de upgrade.
// 'pos' siempre activo y no se puede desactivar.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, Lock, ToggleLeft, ToggleRight, Zap,
  AlertTriangle, RefreshCw, ArrowRight, Shield, Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlan } from '../components/ModuleGuard.jsx';
import { FERZU_PLANS, MODULE_META } from '../lib/plansConfig.js';
import { api } from '../lib/api.js';

// Módulo que nunca puede desactivarse
const CORE_MODULES = ['pos'];

// Orden de presentación en la UI
const MODULE_ORDER = [
  'pos', 'inventory', 'dashboard', 'customers',
  'barbershop', 'kitchen', 'workshop', 'minimarket',
  'dian', 'ai', 'reports',
];

export default function ModulesPage() {
  const { organizationId, user } = useAuth();
  const { modules: planModules, activeModules: ctxActiveModules, plan, refetch } = usePlan();
  const navigate = useNavigate();

  const [activeModules, setActiveModules] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Solo admin/owner puede acceder
  const isAdmin = ['admin', 'owner'].includes(user?.role);

  useEffect(() => {
    if (!isAdmin) { navigate('/dashboard'); return; }
    // Sincronizar estado local con el contexto
    setActiveModules(ctxActiveModules || {});
  }, [ctxActiveModules, isAdmin]);

  // Determinar si un módulo está efectivamente activo
  function isActive(key) {
    if (CORE_MODULES.includes(key)) return true; // pos siempre activo
    return activeModules?.[key] !== false;        // ausente = activo
  }

  function inPlan(key) {
    return planModules?.includes(key);
  }

  function toggle(key) {
    if (CORE_MODULES.includes(key)) return; // no se puede tocar 'pos'
    if (!inPlan(key)) return;               // no puede activar lo que no tiene

    setActiveModules(prev => {
      const next = { ...prev };
      if (isActive(key)) {
        next[key] = false; // desactivar
      } else {
        delete next[key];  // quitar la restricción = activo
      }
      return next;
    });
    setDirty(true);
  }

  const save = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await api.patch('/org/modules', { active_modules: activeModules });
      if (res.data?.success) {
        toast.success('Módulos actualizados');
        setDirty(false);
        await refetch(); // actualizar PlanContext
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }, [dirty, activeModules, refetch]);

  // Separar módulos: en plan vs fuera del plan
  const orderedModules = MODULE_ORDER
    .map(key => MODULE_META[key])
    .filter(Boolean);

  const inPlanModules  = orderedModules.filter(m => inPlan(m.key));
  const lockedModules  = orderedModules.filter(m => !inPlan(m.key));

  const activeCount   = inPlanModules.filter(m => isActive(m.key)).length;
  const inPlanCount   = inPlanModules.length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configuración de módulos</h1>
            <p className="text-sm text-gray-500 mt-1">
              Activa o desactiva los módulos de tu plan. El POS siempre estará disponible.
            </p>
          </div>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              dirty
                ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>

        {/* Resumen del plan */}
        <div className="mt-4 flex items-center gap-3 p-4 bg-brand-50 border border-brand-100 rounded-2xl">
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
            <Zap size={16} className="text-brand-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-brand-900">Plan actual: {plan?.name || 'Gratis'}</p>
            <p className="text-xs text-brand-600 mt-0.5">
              {activeCount} de {inPlanCount} módulos activos
            </p>
          </div>
          <button
            onClick={() => navigate('/pricing')}
            className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1 transition-colors">
            Cambiar plan <ArrowRight size={12} />
          </button>
        </div>

        {dirty && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
            <AlertTriangle size={13} />
            Tienes cambios sin guardar. Los cajeros verán los cambios al guardar.
          </div>
        )}
      </div>

      {/* ── Módulos incluidos en el plan ── */}
      <section className="mb-8">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Módulos de tu plan
        </p>
        <div className="space-y-2">
          {inPlanModules.map(mod => {
            const active = isActive(mod.key);
            const isCore = CORE_MODULES.includes(mod.key);

            return (
              <div
                key={mod.key}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                  active
                    ? 'bg-white border-gray-200 hover:border-gray-300'
                    : 'bg-gray-50 border-gray-200 opacity-70'
                }`}>
                {/* Ícono */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                  active ? 'bg-brand-50' : 'bg-gray-100'
                }`}>
                  {mod.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${active ? 'text-gray-900' : 'text-gray-500'}`}>
                      {mod.label}
                    </p>
                    {isCore && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full font-semibold">
                        <Shield size={9} /> Siempre activo
                      </span>
                    )}
                    {!active && !isCore && (
                      <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
                        Desactivado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{mod.description}</p>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggle(mod.key)}
                  disabled={isCore}
                  title={isCore ? 'El POS siempre está activo' : undefined}
                  className={`shrink-0 transition-all ${isCore ? 'cursor-not-allowed opacity-40' : 'hover:scale-105 active:scale-95'}`}>
                  {active
                    ? <ToggleRight size={32} className="text-brand-500" />
                    : <ToggleLeft  size={32} className="text-gray-300" />
                  }
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Módulos NO incluidos en el plan ── */}
      {lockedModules.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Módulos disponibles en otros planes
          </p>
          <div className="space-y-2">
            {lockedModules.map(mod => {
              // Encontrar el plan más económico que incluye el módulo
              const cheapestPlan = Object.values(FERZU_PLANS)
                .filter(p => p.enabled_modules.includes(mod.key) && p.price_cop !== null)
                .sort((a, b) => (a.price_cop || 0) - (b.price_cop || 0))[0];

              return (
                <div
                  key={mod.key}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50">
                  {/* Ícono bloqueado */}
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl shrink-0 opacity-40">
                    {mod.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-400">{mod.label}</p>
                      {cheapestPlan && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                          Desde {cheapestPlan.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{mod.description}</p>
                  </div>

                  {/* Botón upgrade */}
                  <button
                    onClick={() => navigate(`/pricing?module=${mod.key}`)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 rounded-xl transition-all">
                    <Lock size={11} />
                    Desbloquear
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
            <Info size={13} className="shrink-0 mt-0.5 text-gray-400" />
            <span>
              Para habilitar módulos adicionales, actualiza tu plan. Los cambios son inmediatos.
              {' '}<button onClick={() => navigate('/pricing')} className="text-brand-600 hover:underline font-medium">Ver planes →</button>
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
