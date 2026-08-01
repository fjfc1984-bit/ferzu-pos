/**
 * FERZU POS — CheckoutPage: Flujo de Pago de Planes SaaS
 * =======================================================
 * Accedido desde:
 *   UpgradeWall → /checkout?plan=barbershop
 *   PricingPage  → /checkout?plan=pro
 *
 * Incluye:
 *   CheckoutPage       — flujo principal de 3 pasos
 *   PlanSummary        — resumen del plan seleccionado
 *   ContactStep        — datos del negocio para facturación
 *   PaymentStep        — métodos de pago (Bold, Nequi, transferencia, trial)
 *   SuccessScreen      — pantalla final con enlace al dashboard
 *   useActivatePlan    — mutación para activar plan en Supabase
 *
 * INTEGRACIÓN DE PAGO:
 *   - Bold (Colombia): checkout hospedado — el backend calcula el monto (Regla de Oro #1)
 *   - Nequi/Transferencia: confirmación manual — el webhook de Bold activa el plan automático
 *   - Trial gratuito 14 días: activa plan sin pago en modo trial
 */

import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/math'
import { FERZU_PLANS, MODULE_META } from '../lib/plansConfig'
import { startPlanPayment } from '../lib/boldCheckout'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const PAYMENT_METHODS = [
  {
    id: 'trial',
    label: '14 días gratis',
    description: 'Prueba completa sin tarjeta. Al vencer, elige un plan.',
    icon: '🎁',
    highlight: true,
  },
  {
    id: 'bold',
    label: 'Tarjeta / PSE / Nequi (Bold)',
    description: 'Pago seguro con Bold — Colombia. Todas las tarjetas, PSE y Nequi.',
    icon: '💳',
  },
  {
    id: 'nequi',
    label: 'Nequi directo',
    description: 'Envía al número de Nequi y envíanos el comprobante.',
    icon: '📱',
  },
  {
    id: 'transfer',
    label: 'Transferencia bancaria',
    description: 'Transferencia a cuenta Bancolombia o Davivienda.',
    icon: '🏦',
  },
]

const NEQUI_NUMBER = import.meta.env.VITE_NEQUI_NUMBER || '300 000 0000'
const BANK_INFO = {
  bank: 'Bancolombia',
  account_type: 'Cuenta de Ahorros',
  account_number: '000 000 000 00',
  nit: '900.000.000-0',
  name: 'Ferzu Technologies SAS',
}

// ---------------------------------------------------------------------------
// Hook: activar plan
// ---------------------------------------------------------------------------
function useActivatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ planId, mode, orgId }) => {
      if (mode === 'trial') {
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + 14)

        const plan = FERZU_PLANS[planId]
        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            organization_id: orgId,
            plan_id: planId,
            status: 'trial',
            trial_ends_at: trialEnd.toISOString(),
            current_period_start: new Date().toISOString(),
            current_period_end: trialEnd.toISOString(),
          }, { onConflict: 'organization_id' })

        if (error) throw error

        // Actualizar modules en la organización
        const { error: orgError } = await supabase
          .from('organizations')
          .update({ enabled_modules: plan.enabled_modules })
          .eq('id', orgId)
        if (orgError) throw orgError

        return { success: true, mode: 'trial', trialEnd }
      }

      // Para pago real: crear orden pendiente
      const plan = FERZU_PLANS[planId]
      const { data, error } = await supabase
        .from('payment_orders')
        .insert({
          organization_id: orgId,
          plan_id: planId,
          amount: plan.price_cop,
          status: 'pending',
          payment_method: mode,
        })
        .select()
        .single()

      if (error) throw error
      return { success: true, mode: 'pending', orderId: data.id }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan'] })
      qc.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}

// ---------------------------------------------------------------------------
// PlanSummary — lado derecho del checkout
// ---------------------------------------------------------------------------
function PlanSummary({ planId, isTrialing }) {
  const plan = FERZU_PLANS[planId]
  if (!plan) return null

  return (
    <div className="bg-gray-950 text-white rounded-2xl p-6 flex flex-col h-full">
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Plan seleccionado</p>
        <h2 className="text-2xl font-bold">{plan.name}</h2>
        <p className="text-gray-400 text-sm mt-1">{plan.tagline}</p>
      </div>

      {/* Precio */}
      <div className="bg-white/10 rounded-xl p-4 mb-6">
        {isTrialing ? (
          <div>
            <p className="text-3xl font-black text-emerald-400">Gratis</p>
            <p className="text-xs text-gray-400 mt-0.5">14 días de prueba completa</p>
            <p className="text-xs text-gray-500 mt-2">
              Después: {formatCOP(plan.price_cop)} / mes
            </p>
          </div>
        ) : (
          <div>
            <p className="text-3xl font-black text-white">{formatCOP(plan.price_cop)}</p>
            <p className="text-xs text-gray-400 mt-0.5">por mes · IVA incluido</p>
            <p className="text-xs text-gray-500 mt-2">
              Se cobra automáticamente cada mes. Cancela cuando quieras.
            </p>
          </div>
        )}
      </div>

      {/* Módulos incluidos */}
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Incluye</p>
        <ul className="space-y-2">
          {plan.enabled_modules.map(mod => {
            const meta = MODULE_META[mod]
            if (!meta) return null
            return (
              <li key={mod} className="flex items-center gap-2 text-sm">
                <span className="text-emerald-400">✓</span>
                <span className="text-gray-200">{meta.label}</span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Límites */}
      <div className="mt-6 pt-4 border-t border-white/10 space-y-1">
        <p className="text-xs text-gray-500">
          Hasta {plan.max_products === -1 ? '∞' : plan.max_products.toLocaleString('es-CO')} productos
        </p>
        <p className="text-xs text-gray-500">
          Hasta {plan.max_users === -1 ? '∞' : plan.max_users} usuarios
        </p>
        <p className="text-xs text-gray-500">
          Hasta {plan.max_branches === -1 ? '∞' : plan.max_branches} sucursal{plan.max_branches !== 1 ? 'es' : ''}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Paso 1: Datos del negocio
// ---------------------------------------------------------------------------
function ContactStep({ data, onChange, onNext }) {
  const [err, setErr] = useState(null)

  function validate() {
    if (!data.business_name.trim()) { setErr('El nombre del negocio es obligatorio'); return false }
    if (!data.nit.trim()) { setErr('El NIT es obligatorio'); return false }
    if (!data.email.trim()) { setErr('El correo es obligatorio'); return false }
    if (!data.phone.trim()) { setErr('El teléfono es obligatorio'); return false }
    return true
  }

  function handleNext() {
    if (validate()) onNext()
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Datos del negocio</h2>
        <p className="text-sm text-gray-500 mt-0.5">Para tu factura electrónica de suscripción</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del negocio *</label>
          <input
            value={data.business_name}
            onChange={e => onChange({ ...data, business_name: e.target.value })}
            placeholder="Ej: Restaurante El Sabor"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">NIT *</label>
          <input
            value={data.nit}
            onChange={e => onChange({ ...data, nit: e.target.value })}
            placeholder="900.000.000-0"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Ciudad *</label>
          <input
            value={data.city}
            onChange={e => onChange({ ...data, city: e.target.value })}
            placeholder="Bogotá, Medellín, Cali…"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Correo electrónico *</label>
          <input
            type="email"
            value={data.email}
            onChange={e => onChange({ ...data, email: e.target.value })}
            placeholder="admin@minegocio.com"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono *</label>
          <input
            type="tel"
            value={data.phone}
            onChange={e => onChange({ ...data, phone: e.target.value })}
            placeholder="3001234567"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

      <button
        onClick={handleNext}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition"
      >
        Continuar
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Paso 2: Selección de método de pago
// ---------------------------------------------------------------------------
function PaymentStep({ planId, contactData, onSuccess, onBack }) {
  const [selected, setSelected] = useState('trial')
  const [loading, setLoading] = useState(false)
  const [boldError, setBoldError] = useState(null)
  const activatePlan = useActivatePlan()

  async function handlePay() {
    setBoldError(null)
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: org } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', session.user.id)
        .single()

      if (selected === 'bold') {
        // Redirige al checkout hospedado de Bold
        // El backend calcula el monto (Regla de Oro #1 — nunca el frontend)
        await startPlanPayment({
          planId,
          organizationId: org.organization_id,
          token: session.access_token,
        })
        return  // La navegación ocurre dentro de startPlanPayment (window.location.href)
      }

      const result = await activatePlan.mutateAsync({
        planId,
        mode: selected,
        orgId: org.organization_id,
      })

      onSuccess(result)
    } catch (err) {
      console.error('[CheckoutPage]', err)
      setBoldError(err?.message || 'Error procesando el pago. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const plan = FERZU_PLANS[planId]

  return (
    <div className="space-y-5">
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 transition"
        >
          ← Volver
        </button>
        <h2 className="text-lg font-bold text-gray-900">Método de pago</h2>
        <p className="text-sm text-gray-500 mt-0.5">Elige cómo activar tu plan</p>
      </div>

      <div className="space-y-3">
        {PAYMENT_METHODS.map(method => (
          <label
            key={method.id}
            className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${
              selected === method.id
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            } ${method.highlight ? 'relative overflow-hidden' : ''}`}
          >
            {method.highlight && (
              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-bl-lg">
                RECOMENDADO
              </div>
            )}
            <input
              type="radio"
              name="payment"
              value={method.id}
              checked={selected === method.id}
              onChange={() => setSelected(method.id)}
              className="mt-0.5 accent-emerald-600"
            />
            <div>
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <span>{method.icon}</span> {method.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{method.description}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Instrucciones según método */}
      {selected === 'nequi' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-purple-900">📱 Pago por Nequi</p>
          <ol className="text-xs text-purple-800 space-y-1 list-decimal list-inside">
            <li>Abre tu app de Nequi</li>
            <li>Envía <span className="font-bold">{formatCOP(plan?.price_cop)}</span> al número: <span className="font-mono font-bold">{NEQUI_NUMBER}</span></li>
            <li>Escribe en el mensaje: tu nombre y NIT</li>
            <li>Toma captura y envíala a <a href="mailto:pagos@ferzu.co" className="underline">pagos@ferzu.co</a></li>
          </ol>
          <p className="text-xs text-purple-700">
            ⏱ Activamos tu plan en máximo 2 horas hábiles.
          </p>
        </div>
      )}

      {selected === 'transfer' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-900">🏦 Datos bancarios</p>
          <div className="grid grid-cols-2 gap-1 text-xs text-blue-800">
            <span className="font-medium">Banco:</span>          <span>{BANK_INFO.bank}</span>
            <span className="font-medium">Tipo:</span>           <span>{BANK_INFO.account_type}</span>
            <span className="font-medium">Número:</span>         <span className="font-mono">{BANK_INFO.account_number}</span>
            <span className="font-medium">NIT:</span>            <span>{BANK_INFO.nit}</span>
            <span className="font-medium">Beneficiario:</span>   <span>{BANK_INFO.name}</span>
            <span className="font-medium">Valor:</span>          <span className="font-bold">{formatCOP(plan?.price_cop)}</span>
          </div>
          <p className="text-xs text-blue-700">
            Envía el comprobante a <a href="mailto:pagos@ferzu.co" className="underline">pagos@ferzu.co</a>. Activamos en 2h hábiles.
          </p>
        </div>
      )}

      {/* Mensaje de error de Bold */}
      {boldError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          ⚠️ {boldError}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={loading || activatePlan.isPending}
        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl font-bold text-base transition flex items-center justify-center gap-2"
      >
        {(loading || activatePlan.isPending) ? (
          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : null}
        {selected === 'trial'    ? '🎁 Activar prueba gratuita' :
         selected === 'bold'     ? '💳 Ir a pagar con Bold' :
         selected === 'nequi'    ? '📱 Ya envié el pago' :
                                   '🏦 Ya hice la transferencia'}
      </button>

      <p className="text-center text-xs text-gray-400">
        🔒 Pago seguro con Bold · Cancela cuando quieras · Sin compromisos
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pantalla de éxito
// ---------------------------------------------------------------------------
function SuccessScreen({ result, planId }) {
  const navigate = useNavigate()
  const plan = FERZU_PLANS[planId]

  useEffect(() => {
    // Auto-redirigir al dashboard en 5 segundos
    const t = setTimeout(() => navigate('/dashboard'), 5000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-4xl mb-6 animate-bounce">
        {result.mode === 'trial' ? '🎁' : result.mode === 'pending' ? '⏳' : '🎉'}
      </div>
      <h1 className="text-2xl font-black text-gray-900 mb-2">
        {result.mode === 'trial'   ? '¡Tu prueba está activa!' :
         result.mode === 'pending' ? 'Pago recibido' :
                                     '¡Plan activado!'}
      </h1>
      <p className="text-gray-500 text-sm mb-6 max-w-sm">
        {result.mode === 'trial'
          ? `Tienes 14 días para explorar todo el plan ${plan?.name} sin restricciones. ¡Aprovéchalo!`
          : result.mode === 'pending'
          ? 'Recibimos tu información. Activamos el plan ${plan?.name} en máximo 2 horas hábiles. Te avisamos por correo.'
          : `El plan ${plan?.name} ya está activo en tu cuenta. ¡Empieza a usarlo ahora!`}
      </p>

      {result.mode === 'trial' && result.trialEnd && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-3 mb-6">
          <p className="text-sm text-amber-800">
            ⏰ Tu prueba vence el{' '}
            <span className="font-bold">
              {new Date(result.trialEnd).toLocaleDateString('es-CO', {
                weekday: 'long', day: 'numeric', month: 'long'
              })}
            </span>
          </p>
        </div>
      )}

      <button
        onClick={() => navigate('/dashboard')}
        className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition mb-3"
      >
        Ir al dashboard →
      </button>
      <p className="text-xs text-gray-400">Redirigiendo automáticamente en 5 segundos…</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Barra de pasos
// ---------------------------------------------------------------------------
function StepBar({ step }) {
  const steps = ['Datos', 'Pago', 'Listo']
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition ${
            i + 1 < step  ? 'bg-emerald-600 text-white' :
            i + 1 === step ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' :
                             'bg-gray-100 text-gray-400'
          }`}>
            {i + 1 < step ? '✓' : i + 1}
          </div>
          <span className={`ml-2 text-xs font-medium ${
            i + 1 <= step ? 'text-gray-800' : 'text-gray-400'
          }`}>{label}</span>
          {i < steps.length - 1 && (
            <div className={`mx-4 h-px w-12 ${i + 1 < step ? 'bg-emerald-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CheckoutPage — página principal (exported)
// ---------------------------------------------------------------------------
export function CheckoutPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const planId = searchParams.get('plan') || 'pos_basic'
  const plan = FERZU_PLANS[planId]

  const [step, setStep] = useState(1)
  const [contactData, setContactData] = useState({
    business_name: '',
    nit: '',
    email: '',
    phone: '',
    city: '',
  })
  const [paymentResult, setPaymentResult] = useState(null)
  const [prefilling, setPrefilling] = useState(true)

  // Precargar datos del negocio ya guardados en onboarding
  useEffect(() => {
    async function prefillFromOrg() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data: userData } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', session.user.id)
          .maybeSingle()

        if (!userData?.organization_id) return

        const { data: org } = await supabase
          .from('organizations')
          .select('business_name, nit, email, phone')
          .eq('id', userData.organization_id)
          .maybeSingle()

        // También buscar ciudad de la sucursal principal
        const { data: branch } = await supabase
          .from('branches')
          .select('city')
          .eq('organization_id', userData.organization_id)
          .eq('is_main', true)
          .maybeSingle()

        if (org) {
          setContactData({
            business_name: org.business_name || '',
            nit:           org.nit           || '',
            email:         org.email         || session.user.email || '',
            phone:         org.phone         || '',
            city:          branch?.city      || '',
          })
        }
      } catch (_) {
        // silencioso — el usuario puede llenar manualmente
      } finally {
        setPrefilling(false)
      }
    }
    prefillFromOrg()
  }, [])

  // Si el plan no existe, redirigir
  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div>
          <p className="text-4xl mb-3">🤔</p>
          <p className="text-lg font-semibold text-gray-900 mb-2">Plan no encontrado</p>
          <Link to="/pricing" className="text-emerald-600 text-sm hover:underline">Ver todos los planes</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gray-50 flex items-start justify-center py-10 px-4">
      <div className="w-full max-w-5xl">
        {/* Logo / volver */}
        <div className="flex items-center justify-between mb-8">
          <Link to="/pricing" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition text-sm">
            ← Todos los planes
          </Link>
          <img src="/logo-ferzu.svg" alt="Ferzu" className="h-8" />
          <div className="w-24" /> {/* spacer */}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Panel izquierdo: formulario (3/5) */}
          <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {step < 3 && <StepBar step={step} />}

            {step === 1 && prefilling && (
              <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
                <span className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Cargando tus datos…</span>
              </div>
            )}

            {step === 1 && !prefilling && (
              <>
                {contactData.business_name && (
                  <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <span className="text-emerald-600 text-sm">✓</span>
                    <span className="text-xs text-emerald-700 font-medium">
                      Datos precargados desde tu perfil — puedes editarlos si es necesario
                    </span>
                  </div>
                )}
                <ContactStep
                  data={contactData}
                  onChange={setContactData}
                  onNext={() => setStep(2)}
                />
              </>
            )}

            {step === 2 && (
              <PaymentStep
                planId={planId}
                contactData={contactData}
                onBack={() => setStep(1)}
                onSuccess={(result) => {
                  setPaymentResult(result)
                  setStep(3)
                }}
              />
            )}

            {step === 3 && paymentResult && (
              <SuccessScreen result={paymentResult} planId={planId} />
            )}
          </div>

          {/* Panel derecho: resumen del plan (2/5) */}
          <div className="lg:col-span-2">
            <PlanSummary
              planId={planId}
              isTrialing={step === 2 && false /* se actualiza en PaymentStep */}
            />

            {/* Garantía */}
            <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4 text-center">
              <p className="text-sm font-semibold text-gray-800">🛡️ Garantía de 30 días</p>
              <p className="text-xs text-gray-500 mt-1">
                Si no estás satisfecho, te devolvemos el dinero sin preguntas.
              </p>
            </div>

            {/* Contacto soporte */}
            <div className="mt-3 text-center">
              <p className="text-xs text-gray-400">
                ¿Dudas? Escríbenos a{' '}
                <a href="mailto:soporte@ferzu.co" className="text-emerald-600 hover:underline">
                  soporte@ferzu.co
                </a>
                {' '}o al{' '}
                <a
                  href={`https://wa.me/57${import.meta.env.VITE_SUPPORT_PHONE || '3001234567'}?text=Hola%2C%20tengo%20una%20pregunta%20sobre%20el%20plan%20${plan.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:underline"
                >
                  WhatsApp
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CheckoutPage
