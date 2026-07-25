// =============================================================================
// FERZU POS — AUTH SCREENS + ONBOARDING WIZARD
// Archivo: src/pages/auth/
// Secciones:
//   1. LoginPage.jsx         — Email + password (Supabase Auth)
//   2. PINLockScreen.jsx     — Bloqueo por PIN de cajero (4 dígitos)
//   3. BranchSelector.jsx    — Selección de sucursal al iniciar turno
//   4. OnboardingWizard.jsx  — Setup inicial de nueva organización (5 pasos)
//   5. AuthContext.jsx       — Contexto global de autenticación
// =============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Eye, EyeOff, LogIn, ChevronRight, ChevronLeft, Building2,
  MapPin, Phone, FileText, Package, CheckCircle2, Loader2,
  Lock, User, Scissors, Utensils, ShoppingCart, Wrench, Store,
  Shield, AlertCircle, RefreshCw, ArrowRight, Zap
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';

// =============================================================================
// SECCIÓN 1: LoginPage — Autenticación con Supabase Auth
// =============================================================================

export function LoginPage() {
  const navigate    = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show,  setShow]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email:    form.email.trim().toLowerCase(),
      password: form.password,
    });

    if (authError) {
      setLoading(false);
      setError(
        authError.message.includes('Invalid login')
          ? 'Correo o contraseña incorrectos'
          : authError.message
      );
      return;
    }

    // Verificar si la org ya tiene configuración → onboarding o POS
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id, role, organizations(onboarding_completed)')
      .eq('id', data.user.id)
      .single();

    if (!userData?.organizations?.onboarding_completed) {
      navigate('/onboarding');
    } else {
      navigate('/branch-select');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Zap size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">FERZU POS</h1>
          <p className="text-brand-200 text-sm mt-1">Sistema de punto de venta inteligente</p>
        </div>

        {/* Card de login */}
        <div className="bg-white rounded-3xl shadow-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Iniciar sesión</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Correo electrónico</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="usuario@empresa.com"
                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Contraseña</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full h-11 border border-gray-200 rounded-xl px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />}
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/forgot-password" className="text-xs text-brand-600 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              ¿Sin cuenta?{' '}
              <Link to="/register" className="text-brand-600 font-medium hover:underline">
                Registrar organización
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-brand-300 text-[11px] mt-6">
          Datos protegidos bajo Ley 1581 de 2012 · Colombia
        </p>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 2: PINLockScreen — Bloqueo por PIN de cajero
// Se muestra cuando la caja lleva 5 min inactiva o al cambiar de cajero
// =============================================================================

export function PINLockScreen({ onUnlock, currentUser }) {
  const [digits,  setDigits]  = useState([]);
  const [shake,   setShake]   = useState(false);
  const [loading, setLoading] = useState(false);
  const PIN_LENGTH = 4;

  // Intentos de PIN
  const [attempts, setAttempts] = useState(0);
  const LOCK_AFTER = 5;

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'DEL'];

  function handleKey(k) {
    if (loading || attempts >= LOCK_AFTER) return;

    if (k === 'DEL') {
      setDigits(d => d.slice(0, -1));
      return;
    }
    if (digits.length >= PIN_LENGTH) return;

    const next = [...digits, k];
    setDigits(next);

    if (next.length === PIN_LENGTH) {
      verifyPIN(next.join(''));
    }
  }

  // Soporte teclado físico
  useEffect(() => {
    function onKey(e) {
      if (e.key >= '0' && e.key <= '9') handleKey(Number(e.key));
      if (e.key === 'Backspace') handleKey('DEL');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [digits, loading]);

  async function verifyPIN(pin) {
    setLoading(true);
    // El PIN se guarda como bcrypt en la tabla users (campo pin_hash)
    // El backend verifica — nunca el cliente
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pin }),
      });

      const json = await res.json();
      if (json.valid) {
        onUnlock(json.user);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setShake(true);
        setDigits([]);
        setTimeout(() => setShake(false), 600);
        if (newAttempts >= LOCK_AFTER) {
          toast.error('Demasiados intentos. Bloqueo activado 5 minutos.');
        }
      }
    } catch {
      toast.error('Error de conexión');
      setDigits([]);
    } finally {
      setLoading(false);
    }
  }

  const locked = attempts >= LOCK_AFTER;

  return (
    <div className="fixed inset-0 bg-gray-950/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center">

        {/* Avatar del usuario */}
        <div className="w-16 h-16 rounded-full bg-brand-600 flex items-center justify-center text-2xl font-bold text-white mx-auto mb-3">
          {currentUser?.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <p className="text-white font-semibold mb-1">{currentUser?.full_name || 'Cajero'}</p>
        <p className="text-gray-400 text-sm mb-6">Ingresa tu PIN para continuar</p>

        {/* Indicador de dígitos */}
        <div className={`flex justify-center gap-3 mb-6 transition-transform ${shake ? 'animate-shake' : ''}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < digits.length
                  ? 'bg-brand-400 border-brand-400 scale-110'
                  : 'bg-transparent border-gray-500'
              }`}
            />
          ))}
        </div>

        {/* Teclado numérico */}
        {locked ? (
          <div className="text-red-400 text-sm flex items-center gap-2 justify-center">
            <Lock size={15} />
            Bloqueado. Contacta al administrador.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 w-56 mx-auto">
            {keys.map((k, i) => {
              if (k === null) return <div key={i} />;
              return (
                <button
                  key={i}
                  onClick={() => handleKey(k)}
                  disabled={loading}
                  className={`h-14 rounded-2xl font-semibold text-lg transition-all active:scale-90 ${
                    k === 'DEL'
                      ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 text-sm'
                      : 'bg-gray-800 text-white hover:bg-gray-700'
                  }`}>
                  {k === 'DEL' ? '⌫' : k}
                </button>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Loader2 size={14} className="animate-spin" />
            Verificando...
          </div>
        )}

        {attempts > 0 && attempts < LOCK_AFTER && (
          <p className="mt-3 text-red-400 text-xs">
            PIN incorrecto · {LOCK_AFTER - attempts} intento(s) restante(s)
          </p>
        )}
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 3: BranchSelector — Selección de sucursal al iniciar sesión
// =============================================================================

export function BranchSelector() {
  const navigate  = useNavigate();
  const [branches, setBranches] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }

      const { data } = await supabase
        .from('user_branches')
        .select(`
          branch_id,
          branches(id, name, address, city, is_active, metadata)
        `)
        .eq('user_id', user.id);

      const activeBranches = (data || [])
        .map(r => r.branches)
        .filter(b => b?.is_active);

      if (activeBranches.length === 1) {
        // Si solo hay una sucursal, entrar directo
        localStorage.setItem('ferzu_branch_id', activeBranches[0].id);
        navigate('/pos');
        return;
      }

      setBranches(activeBranches);
      setLoading(false);
    }
    load();
  }, [navigate]);

  function selectBranch(branch) {
    localStorage.setItem('ferzu_branch_id', branch.id);
    localStorage.setItem('ferzu_branch_name', branch.name);
    navigate('/pos');
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-brand-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Building2 size={36} className="text-white mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-white">¿Desde qué sucursal?</h2>
          <p className="text-brand-200 text-sm mt-1">Selecciona la sucursal donde vas a trabajar hoy</p>
        </div>

        <div className="space-y-3">
          {branches.map(branch => (
            <button
              key={branch.id}
              onClick={() => selectBranch(branch)}
              className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99] group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{branch.name}</p>
                  <p className="text-brand-200 text-xs mt-0.5 flex items-center gap-1">
                    <MapPin size={10} />
                    {branch.city} · {branch.address}
                  </p>
                </div>
                <ChevronRight size={18} className="text-white/50 group-hover:text-white transition-colors" />
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => supabase.auth.signOut().then(() => navigate('/login'))}
          className="mt-6 w-full text-center text-brand-200 hover:text-white text-xs transition-colors">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 4: OnboardingWizard — Setup inicial de nueva organización
// 5 pasos: Empresa → Nicho → Sucursal → DIAN → Primer producto
// =============================================================================

const NICHES = [
  { key: 'restaurant',  label: 'Restaurante',   icon: Utensils,   desc: 'Mesas, cocina, comandas'    },
  { key: 'barbershop',  label: 'Barbería',       icon: Scissors,   desc: 'Citas, estilistas, comisiones' },
  { key: 'minimarket',  label: 'Minimarket',     icon: ShoppingCart, desc: 'Inventario, balanza, lotes' },
  { key: 'workshop',    label: 'Taller',         icon: Wrench,     desc: 'Órdenes de trabajo, repuestos' },
  { key: 'retail',      label: 'Tienda',         icon: Store,      desc: 'Ventas, inventario, clientes' },
  { key: 'mixed',       label: 'Otro / Mixto',   icon: Zap,        desc: 'Configura a tu medida'      },
];

export function OnboardingWizard() {
  const navigate = useNavigate();
  const [step,    setStep]    = useState(1);
  const TOTAL_STEPS = 5;

  const [org, setOrg] = useState({
    // Paso 1 — Empresa
    business_name:  '',
    nit:            '',
    phone:          '',
    email:          '',
    // Paso 2 — Nicho
    business_type:  '',
    // Paso 3 — Sucursal
    branch_name:    'Sede Principal',
    address:        '',
    city:           '',
    department:     '',
    // Paso 4 — DIAN
    dian_resolution_number: '',
    dian_prefix:            '',
    dian_from_number:       '',
    dian_to_number:         '',
    dian_resolution_date:   '',
    pta_provider:           'alegra',
    skip_dian:              false,
    // Paso 5 — Primer producto
    first_product_name:  '',
    first_product_price: '',
    first_product_sku:   '',
  });

  const [saving, setSaving] = useState(false);

  function next() { if (step < TOTAL_STEPS) setStep(s => s + 1); }
  function back() { if (step > 1)           setStep(s => s - 1); }

  function update(fields) {
    setOrg(o => ({ ...o, ...fields }));
  }

  const canNext = {
    1: org.business_name && org.nit && org.phone,
    2: org.business_type,
    3: org.branch_name && org.address && org.city,
    4: org.skip_dian || (org.dian_resolution_number && org.dian_prefix && org.dian_from_number && org.dian_to_number),
    5: true, // El primer producto es opcional
  };

  async function handleFinish() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Crear organización
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({
          business_name:      org.business_name,
          nit:                org.nit,
          phone:              org.phone,
          email:              org.email,
          business_type:      org.business_type,
          onboarding_completed: true,
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // 2. Crear sucursal principal
      const { data: branchData, error: branchError } = await supabase
        .from('branches')
        .insert({
          organization_id: orgData.id,
          name:            org.branch_name,
          address:         org.address,
          city:            org.city,
          department:      org.department,
          is_main:         true,
          is_active:       true,
        })
        .select()
        .single();

      if (branchError) throw branchError;

      // 3. Asociar usuario con organización y sucursal
      await supabase.from('users').update({
        organization_id: orgData.id,
        role: 'owner',
      }).eq('id', user.id);

      await supabase.from('user_branches').insert({
        user_id:   user.id,
        branch_id: branchData.id,
        role:      'owner',
      });

      // 4. Configuración DIAN (si se proporcionó)
      if (!org.skip_dian && org.dian_resolution_number) {
        await supabase.from('dian_configs').insert({
          organization_id:         orgData.id,
          branch_id:               branchData.id,
          resolution_number:       org.dian_resolution_number,
          prefix:                  org.dian_prefix,
          from_number:             Number(org.dian_from_number),
          to_number:               Number(org.dian_to_number),
          current_number:          Number(org.dian_from_number),
          resolution_date:         org.dian_resolution_date,
          pta_provider:            org.pta_provider,
          is_active:               true,
        });
      }

      // 5. Primer producto (si se proporcionó)
      if (org.first_product_name && org.first_product_price) {
        const { data: prodData } = await supabase.from('products').insert({
          organization_id: orgData.id,
          name:            org.first_product_name,
          sku:             org.first_product_sku || `PROD-001`,
          price:           Math.round(Number(org.first_product_price.replace(/\D/g, ''))),
          is_active:       true,
          item_type:       'product',
        }).select().single();

        // Inventario inicial en 0
        if (prodData) {
          await supabase.from('inventory').insert({
            product_id: prodData.id,
            branch_id:  branchData.id,
            quantity:   0,
            min_stock:  5,
          });
        }
      }

      localStorage.setItem('ferzu_branch_id',   branchData.id);
      localStorage.setItem('ferzu_branch_name',  org.branch_name);
      toast.success('¡Organización configurada! Bienvenido a FERZU POS 🎉');
      navigate('/pos');

    } catch (err) {
      toast.error(err.message || 'Error al guardar. Intenta de nuevo.');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Progreso */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-sm font-medium text-gray-500">Configuración inicial</h1>
            <span className="text-sm text-gray-400">Paso {step} de {TOTAL_STEPS}</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full">
            <div
              className="h-1.5 bg-brand-500 rounded-full transition-all duration-500"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          {/* ── PASO 1: Datos de la empresa ── */}
          {step === 1 && (
            <OnboardingStep title="Tu empresa" icon={<Building2 className="text-brand-500" />}>
              <div className="space-y-4">
                <Field label="Nombre del negocio *" value={org.business_name}
                  onChange={v => update({ business_name: v })} placeholder="Ej: Restaurante El Buen Sabor" />
                <Field label="NIT *" value={org.nit}
                  onChange={v => update({ nit: v })} placeholder="900.123.456-7" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Teléfono *" value={org.phone}
                    onChange={v => update({ phone: v })} placeholder="300 123 4567" />
                  <Field label="Correo" value={org.email} type="email"
                    onChange={v => update({ email: v })} placeholder="info@empresa.com" />
                </div>
              </div>
            </OnboardingStep>
          )}

          {/* ── PASO 2: Tipo de negocio ── */}
          {step === 2 && (
            <OnboardingStep title="¿Qué tipo de negocio es?" icon={<Store className="text-brand-500" />}>
              <div className="grid grid-cols-2 gap-3">
                {NICHES.map(niche => {
                  const Icon = niche.icon;
                  const selected = org.business_type === niche.key;
                  return (
                    <button
                      key={niche.key}
                      onClick={() => update({ business_type: niche.key })}
                      className={`text-left p-3 rounded-2xl border-2 transition-all ${
                        selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-200'
                      }`}>
                      <Icon size={20} className={selected ? 'text-brand-600' : 'text-gray-400'} />
                      <p className={`font-medium text-sm mt-1.5 ${selected ? 'text-brand-800' : 'text-gray-700'}`}>{niche.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{niche.desc}</p>
                    </button>
                  );
                })}
              </div>
            </OnboardingStep>
          )}

          {/* ── PASO 3: Sucursal principal ── */}
          {step === 3 && (
            <OnboardingStep title="Sucursal principal" icon={<MapPin className="text-brand-500" />}>
              <div className="space-y-4">
                <Field label="Nombre de la sucursal" value={org.branch_name}
                  onChange={v => update({ branch_name: v })} placeholder="Sede Principal" />
                <Field label="Dirección *" value={org.address}
                  onChange={v => update({ address: v })} placeholder="Calle 123 # 45-67" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Ciudad *" value={org.city}
                    onChange={v => update({ city: v })} placeholder="Bogotá" />
                  <Field label="Departamento" value={org.department}
                    onChange={v => update({ department: v })} placeholder="Cundinamarca" />
                </div>
              </div>
            </OnboardingStep>
          )}

          {/* ── PASO 4: Configuración DIAN ── */}
          {step === 4 && (
            <OnboardingStep title="Facturación electrónica DIAN" icon={<FileText className="text-brand-500" />}>
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  💡 Necesitas una resolución de facturación vigente del portal DIAN. Si aún no la tienes, puedes omitir este paso y configurarla después.
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={org.skip_dian}
                    onChange={e => update({ skip_dian: e.target.checked })}
                    className="rounded" />
                  <span className="text-sm text-gray-600">Omitir por ahora (configurar después)</span>
                </label>

                {!org.skip_dian && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="N° resolución" value={org.dian_resolution_number}
                        onChange={v => update({ dian_resolution_number: v })} placeholder="18760000001" />
                      <Field label="Prefijo" value={org.dian_prefix}
                        onChange={v => update({ dian_prefix: v })} placeholder="FE" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Desde" value={org.dian_from_number}
                        onChange={v => update({ dian_from_number: v })} placeholder="1" type="number" />
                      <Field label="Hasta" value={org.dian_to_number}
                        onChange={v => update({ dian_to_number: v })} placeholder="100000" type="number" />
                    </div>
                    <Field label="Fecha resolución" value={org.dian_resolution_date}
                      onChange={v => update({ dian_resolution_date: v })} type="date" />

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block">Proveedor tecnológico (PTA)</label>
                      <div className="flex gap-2">
                        {['alegra','siigo','custom'].map(p => (
                          <button key={p} onClick={() => update({ pta_provider: p })}
                            className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors capitalize ${
                              org.pta_provider === p ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                            {p === 'custom' ? 'Otro' : p.charAt(0).toUpperCase() + p.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </OnboardingStep>
          )}

          {/* ── PASO 5: Primer producto ── */}
          {step === 5 && (
            <OnboardingStep title="Añade tu primer producto" icon={<Package className="text-brand-500" />}>
              <div className="space-y-4">
                <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 text-xs text-brand-800">
                  ✨ Opcional. Puedes agregar todos tus productos desde el módulo de Inventario.
                </div>
                <Field label="Nombre del producto" value={org.first_product_name}
                  onChange={v => update({ first_product_name: v })} placeholder="Ej: Café americano" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Precio (COP)" value={org.first_product_price}
                    onChange={v => update({ first_product_price: v })} placeholder="5000" type="number" />
                  <Field label="SKU / Código" value={org.first_product_sku}
                    onChange={v => update({ first_product_sku: v })} placeholder="CAF-001" />
                </div>
              </div>
            </OnboardingStep>
          )}

          {/* ── Navegación ── */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            {step > 1 ? (
              <button onClick={back}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                <ChevronLeft size={16} /> Atrás
              </button>
            ) : <div />}

            {step < TOTAL_STEPS ? (
              <button
                onClick={next}
                disabled={!canNext[step]}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
                Siguiente <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? 'Configurando...' : '¡Empezar a vender!'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-componentes de onboarding
function OnboardingStep({ title, icon, children }) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
          {React.cloneElement(icon, { size: 18 })}
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
      />
    </div>
  );
}


// =============================================================================
// SECCIÓN 5: AuthContext.jsx — Contexto global
// Archivo: src/context/AuthContext.jsx
// =============================================================================
// NOTA: Este bloque va en src/context/AuthContext.jsx (separado de main.jsx)

export const AuthContext = React.createContext(null);

export function AuthProvider({ children }) {
  const [user,           setUser]           = useState(null);
  const [organizationId, setOrganizationId] = useState(null);
  const [branchId,       setBranchId]       = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [showPINLock,    setShowPINLock]    = useState(false);

  // Temporizador de inactividad: 5 minutos → mostrar PIN
  const inactivityTimer = useRef(null);
  const INACTIVITY_MS   = 5 * 60 * 1000;

  function resetInactivityTimer() {
    clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      setShowPINLock(true);
    }, INACTIVITY_MS);
  }

  useEffect(() => {
    // Cargar sesión inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUserProfile(session.user.id);
        resetInactivityTimer();
      }
      setLoading(false);
    });

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setOrganizationId(null);
        setBranchId(null);
        clearTimeout(inactivityTimer.current);
      } else if (session?.user) {
        await loadUserProfile(session.user.id);
        resetInactivityTimer();
      }
    });

    // Eventos de interacción para resetear el timer
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }));

    return () => {
      subscription.unsubscribe();
      clearTimeout(inactivityTimer.current);
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer));
    };
  }, []);

  async function loadUserProfile(userId) {
    const { data } = await supabase
      .from('users')
      .select(`
        id, full_name, email, role, pin_hash,
        organization_id,
        organizations(id, business_name, business_type, onboarding_completed),
        user_branches(branch_id)
      `)
      .eq('id', userId)
      .single();

    if (data) {
      setUser(data);
      setOrganizationId(data.organization_id);
      // Restaurar branchId desde localStorage
      const storedBranch = localStorage.getItem('ferzu_branch_id');
      if (storedBranch) setBranchId(storedBranch);
    }
  }

  async function signOut() {
    localStorage.removeItem('ferzu_branch_id');
    localStorage.removeItem('ferzu_branch_name');
    await supabase.auth.signOut();
  }

  function handlePINUnlock(unlockedUser) {
    setShowPINLock(false);
    if (unlockedUser) setUser(unlockedUser);
    resetInactivityTimer();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Zap size={32} className="text-brand-500 mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-gray-400">Cargando FERZU...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user, organizationId, branchId, setBranchId,
      signOut,
      logout: signOut,                                          // alias para POSPage
      isAuthenticated: !!user,
      pinLocked: showPINLock,                                   // App.jsx necesita esto
      isAdmin: user?.role === 'owner' || user?.role === 'admin', // DiscountModal
    }}>
      {children}
      {showPINLock && user && (
        <PINLockScreen
          currentUser={user}
          onUnlock={handlePINUnlock}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}


// =============================================================================
// NOTA: Rutas requeridas en App.jsx (agregar a react-router-dom)
// =============================================================================
/*
import { LoginPage, BranchSelector, OnboardingWizard } from './pages/auth/AuthScreens.jsx';

<Routes>
  <Route path="/login"          element={<LoginPage />} />
  <Route path="/onboarding"     element={<OnboardingWizard />} />
  <Route path="/branch-select"  element={<BranchSelector />} />
  <Route path="/pos"            element={<PrivateRoute><POSPage /></PrivateRoute>} />
  <Route path="/barbershop"     element={<PrivateRoute><BarbershopPage /></PrivateRoute>} />
  <Route path="/kitchen"        element={<PrivateRoute><KitchenDisplayPage /></PrivateRoute>} />
  <Route path="/dashboard"      element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
  <Route path="/"               element={<Navigate to="/pos" />} />
</Routes>

// PrivateRoute: redirige a /login si no hay sesión
function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
}
*/

// =============================================================================
// NOTA: Endpoint backend requerido (agregar a ferzu_backend_api.js)
// POST /auth/verify-pin
// =============================================================================
/*
import bcrypt from 'bcrypt';

app.post('/auth/verify-pin', requireAuth, async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ valid: false, error: 'PIN inválido' });
  }

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('id, full_name, role, pin_hash')
    .eq('organization_id', req.organizationId)
    .not('pin_hash', 'is', null);

  // Verificar contra todos los usuarios de la org (cambio de cajero)
  for (const u of userData || []) {
    const match = await bcrypt.compare(pin, u.pin_hash);
    if (match) {
      logAudit(req, 'pin_unlock', 'users', u.id);
      return res.json({ valid: true, user: { id: u.id, full_name: u.full_name, role: u.role } });
    }
  }

  return res.json({ valid: false });
});

// Para guardar/cambiar PIN (ruta protegida):
// PATCH /users/me/pin  { pin: "1234" } → bcrypt.hash(pin, 12) → users.pin_hash
app.patch('/users/me/pin', requireAuth, async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN debe ser 4 dígitos' });
  const hash = await bcrypt.hash(pin, 12);
  await supabaseAdmin.from('users').update({ pin_hash: hash }).eq('id', req.user.id);
  logAudit(req, 'pin_changed', 'users', req.user.id);
  res.json({ success: true });
});
*/
