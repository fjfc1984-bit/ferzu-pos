// =============================================================================
// FERZU POS — SettingsPage
// Configuración de la organización: WhatsApp Business API
// =============================================================================

import { useState, useEffect } from 'react'
import { MessageSquare, CheckCircle2, XCircle, Send, Info, ExternalLink, Bell, Mail, Phone, Plus, Trash2, ChevronDown, ChevronUp, Building2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { useTrack } from '../hooks/useTrack.js'

// ── Helper ────────────────────────────────────────────────────────────────────
function StatusBadge({ ok, label }) {
  return ok
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={12} />{label}</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"><XCircle size={12} />{label}</span>
}

// =============================================================================
// WhatsApp Section
// =============================================================================
function WhatsAppSection({ settings, onSaved }) {
  const wa = settings?.whatsapp || {}

  const [autoSend,    setAutoSend]    = useState(wa.autoSendReceipt ?? true)
  const [testPhone,   setTestPhone]   = useState('')
  const [saving,      setSaving]      = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [feedback,    setFeedback]    = useState(null) // { type: 'success'|'error', msg }

  // Sync when settings load
  useEffect(() => { setAutoSend(wa.autoSendReceipt ?? true) }, [wa.autoSendReceipt])

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch('/settings/whatsapp', { auto_send_receipt: autoSend })
      showFeedback('success', 'Configuración guardada')
      onSaved?.()
    } catch (err) {
      showFeedback('error', err?.response?.data?.error || 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testPhone.trim()) { showFeedback('error', 'Ingresa un número de WhatsApp'); return }
    setTesting(true)
    try {
      const { data } = await api.post('/settings/whatsapp/test', { phone: testPhone.trim() })
      showFeedback('success', data.message || 'Mensaje enviado')
    } catch (err) {
      showFeedback('error', err?.response?.data?.error || 'Error enviando mensaje')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
          <MessageSquare size={20} className="text-green-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-800">WhatsApp Business API</h2>
            <StatusBadge ok={wa.configured} label={wa.configured ? 'Conectado' : 'Sin configurar'} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Envía recibos automáticos post-venta a tus clientes</p>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Status info */}
        {wa.configured ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-sm text-emerald-800 space-y-1">
            <div className="font-semibold flex items-center gap-1.5"><CheckCircle2 size={14} />API conectada</div>
            <div className="text-xs text-emerald-700">
              Token: <code className="bg-emerald-100 px-1 rounded">{wa.tokenPreview || '···'}</code>
              {wa.phoneNumberId && <> · Phone ID: <code className="bg-emerald-100 px-1 rounded">{wa.phoneNumberId}</code></>}
              {wa.templateName  && <> · Template: <code className="bg-emerald-100 px-1 rounded">{wa.templateName}</code></>}
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800 space-y-2">
            <div className="font-semibold flex items-center gap-1.5"><Info size={14} />WhatsApp no configurado</div>
            <p className="text-xs text-amber-700">
              Para activar el envío automático de recibos necesitas una cuenta Meta Business y agregar las variables de entorno en Railway.
            </p>
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 underline underline-offset-2"
            >
              Ver guía de configuración Meta <ExternalLink size={11} />
            </a>
          </div>
        )}

        {/* Variables de Railway (instrucciones) */}
        {!wa.configured && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Variables requeridas en Railway</h3>
            <div className="bg-gray-900 text-gray-100 rounded-xl p-4 font-mono text-xs space-y-1 leading-relaxed">
              <div><span className="text-emerald-400">WHATSAPP_TOKEN</span>=<span className="text-amber-300">EAAxxxxxxxx...</span></div>
              <div><span className="text-emerald-400">WHATSAPP_PHONE_NUMBER_ID</span>=<span className="text-amber-300">123456789012345</span></div>
              <div><span className="text-emerald-400">WHATSAPP_TEMPLATE_NAME</span>=<span className="text-gray-400">ferzu_recibo</span></div>
              <div><span className="text-emerald-400">WHATSAPP_TEMPLATE_LANG</span>=<span className="text-gray-400">es</span></div>
            </div>
            <p className="text-xs text-gray-400">Después de agregar las variables, Railway redesplegará automáticamente el backend.</p>
          </div>
        )}

        {/* Preferencias (siempre visibles) */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Preferencias</h3>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => setAutoSend(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${autoSend ? 'bg-emerald-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoSend ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm text-gray-700">Enviar recibo automático al marcar venta como pagada</span>
          </label>
          <p className="text-xs text-gray-400 ml-13">Solo se envía si el cliente tiene número de WhatsApp registrado y la API está configurada.</p>
        </div>

        {/* Botón guardar */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando…' : 'Guardar preferencias'}
          </button>
          {feedback && (
            <span className={`text-sm font-medium ${feedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {feedback.msg}
            </span>
          )}
        </div>

        {/* Test de envío */}
        {wa.configured && (
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Enviar mensaje de prueba</h3>
            <div className="flex gap-2">
              <input
                type="tel"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="3001234567"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                onClick={handleTest}
                disabled={testing}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Send size={14} />
                {testing ? 'Enviando…' : 'Probar'}
              </button>
            </div>
            <p className="text-xs text-gray-400">Se enviará un mensaje de prueba con datos ficticios al número indicado.</p>
          </div>
        )}

        {/* Template info */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-1">
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Template de mensaje (ferzu_recibo)</h4>
          <p className="text-sm text-gray-700 italic mt-1">
            "Hola <span className="not-italic font-medium text-gray-900">[Nombre]</span>, tu compra en <span className="not-italic font-medium text-gray-900">[Negocio]</span> por <span className="not-italic font-medium text-gray-900">$[Total]</span> fue procesada. N° <span className="not-italic font-medium text-gray-900">[Orden]</span>. ¡Gracias!"
          </p>
          <p className="text-xs text-gray-400">Debes crear y aprobar este template en tu panel Meta Business antes de activar el envío.</p>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Alerts Section — Level 2 Notifications
// =============================================================================

const SUBSCRIPTION_TYPES = [
  { key: 'out_of_stock',          label: '🔴 Producto agotado',          desc: 'Stock llega a cero en cualquier sucursal' },
  { key: 'low_stock',             label: '⚠️ Stock bajo',                 desc: 'Stock cae por debajo del mínimo configurado' },
  { key: 'cash_discrepancy',      label: '💰 Descuadre de caja',          desc: 'Diferencia detectada al cierre de caja' },
  { key: 'security_anomaly',      label: '🔒 Anomalía de seguridad',       desc: 'Descuentos o anulaciones sospechosas' },
  { key: 'inventory_discrepancy', label: '📦 Discrepancia de inventario',  desc: 'Merma o inconsistencia detectada por IA' },
  { key: 'margin_loss',           label: '📉 Pérdida de margen',           desc: 'Venta con margen negativo detectada' },
]

const SEVERITY_OPTIONS = [
  { value: 'low',      label: 'Cualquier nivel' },
  { value: 'medium',   label: 'Media o superior' },
  { value: 'high',     label: 'Alta o superior' },
  { value: 'critical', label: 'Solo críticas' },
]

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${value ? 'bg-emerald-500' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </div>
  )
}

function TagInput({ values = [], onChange, placeholder, type = 'text' }) {
  const [input, setInput] = useState('')

  const add = () => {
    const v = input.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
    setInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type={type}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <button
          onClick={add}
          className="inline-flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map(v => (
            <span key={v} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
              {v}
              <button onClick={() => onChange(values.filter(x => x !== v))} className="text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// OrgProfileSection — Datos del negocio para recibos/facturas
// =============================================================================
function OrgProfileSection({ settings, onSaved }) {
  const org = settings?.org || {}
  const [address,    setAddress]    = useState(org.address    || '')
  const [phone,      setPhone]      = useState(org.phone      || '')
  const [taxRegime,  setTaxRegime]  = useState(org.tax_regime || 'No responsable de IVA')
  const [saving,     setSaving]     = useState(false)
  const [feedback,   setFeedback]   = useState(null)

  useEffect(() => {
    const addr = org.address    || ''
    const ph   = org.phone      || ''
    const tr   = org.tax_regime || 'No responsable de IVA'
    setAddress(addr)
    setPhone(ph)
    setTaxRegime(tr)
    // Sincronizar localStorage con lo que viene del servidor
    addr ? localStorage.setItem('ferzu_org_address',    addr) : localStorage.removeItem('ferzu_org_address')
    ph   ? localStorage.setItem('ferzu_org_phone',      ph)   : localStorage.removeItem('ferzu_org_phone')
    tr   ? localStorage.setItem('ferzu_org_tax_regime', tr)   : localStorage.removeItem('ferzu_org_tax_regime')
  }, [org.address, org.phone, org.tax_regime])

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch('/settings/org', { address, phone, tax_regime: taxRegime })
      // Persistir en localStorage para que los recibos los lean sin API call
      address   ? localStorage.setItem('ferzu_org_address',    address)    : localStorage.removeItem('ferzu_org_address')
      phone     ? localStorage.setItem('ferzu_org_phone',      phone)      : localStorage.removeItem('ferzu_org_phone')
      taxRegime ? localStorage.setItem('ferzu_org_tax_regime', taxRegime)  : localStorage.removeItem('ferzu_org_tax_regime')
      showFeedback('success', 'Datos guardados')
      onSaved?.()
    } catch (err) {
      showFeedback('error', err?.response?.data?.error || 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <Building2 size={20} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Datos del negocio</h2>
          <p className="text-xs text-gray-500">Se muestran en tus recibos y facturas</p>
        </div>
      </div>

      {/* Campos de solo lectura (del onboarding) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Nombre / Razón social</label>
          <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100">
            {org.name || org.legal_name || '—'}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">NIT</label>
          <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100">
            {org.nit ? `${org.nit}${org.nit_dv ? '-' + org.nit_dv : ''}` : '—'}
          </div>
        </div>
      </div>

      {/* Campos editables */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Dirección</label>
        <input
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="Ej: Calle 10 #5-30, Medellín"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Teléfono</label>
        <input
          type="text"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Ej: 604 123 4567"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Régimen tributario</label>
        <select
          value={taxRegime}
          onChange={e => setTaxRegime(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        >
          <option value="No responsable de IVA">No responsable de IVA</option>
          <option value="Responsable de IVA">Responsable de IVA</option>
          <option value="Gran Contribuyente">Gran Contribuyente</option>
          <option value="Régimen Simple de Tributación">Régimen Simple de Tributación</option>
        </select>
      </div>

      {feedback && (
        <div className={`text-sm px-3 py-2 rounded-lg ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {feedback.msg}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Guardando…' : 'Guardar datos del negocio'}
      </button>
    </div>
  )
}


function AlertsSection() {
  const [config,        setConfig]        = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [testing,       setTesting]       = useState(null) // 'email'|'whatsapp'|null
  const [feedback,      setFeedback]      = useState(null)
  const [subsExpanded,  setSubsExpanded]  = useState(false)

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  const loadAlerts = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/settings/alerts')
      setConfig(data.alerts)
    } catch {
      showFeedback('error', 'No se pudo cargar la configuración de alertas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAlerts() }, [])

  const patch = async (partial) => {
    setSaving(true)
    try {
      const { data } = await api.patch('/settings/alerts', partial)
      setConfig(data.alerts)
      showFeedback('success', 'Guardado')
    } catch (err) {
      showFeedback('error', err?.response?.data?.error || 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (channel) => {
    setTesting(channel)
    try {
      // Enviar los números actuales en UI (pueden no estar aún en BD si el usuario
      // acaba de escribirlos sin haber hecho PATCH previo)
      const body = { channel }
      if (channel === 'whatsapp' || channel === 'all') {
        body.phone_numbers = waCfg.phone_numbers || []
      }
      const { data } = await api.post('/settings/alerts/test', body)
      showFeedback('success', data.message || 'Alerta de prueba enviada')
    } catch (err) {
      showFeedback('error', err?.response?.data?.error || 'Error enviando prueba')
    } finally {
      setTesting(null)
    }
  }

  const updateSubscription = (key, changes) => {
    const updated = {
      subscriptions: {
        ...(config?.subscriptions || {}),
        [key]: { ...(config?.subscriptions?.[key] || {}), ...changes },
      },
    }
    patch(updated)
  }

  if (loading) return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-center h-32">
      <div className="w-6 h-6 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const emailCfg   = config?.channels?.email    || {}
  const waCfg      = config?.channels?.whatsapp  || {}
  const subs       = config?.subscriptions       || {}
  const isEnabled  = config?.enabled             ?? false
  const cooldown   = config?.cooldown_minutes    ?? 60

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
          <Bell size={20} className="text-amber-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-800">Alertas Level 2</h2>
            <StatusBadge ok={isEnabled} label={isEnabled ? 'Activo' : 'Inactivo'} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Notificaciones en tiempo real por email y WhatsApp cuando ocurren eventos críticos</p>
        </div>
        <Toggle value={isEnabled} onChange={v => patch({ enabled: v })} />
      </div>

      <div className={`transition-opacity ${isEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="p-6 space-y-6">

          {/* Email */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Mail size={15} className="text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">Email</h3>
              <Toggle value={emailCfg.enabled ?? false} onChange={v => patch({ channels: { email: { enabled: v } } })} />
            </div>
            <TagInput
              values={emailCfg.recipients || []}
              onChange={recipients => patch({ channels: { email: { recipients } } })}
              placeholder="correo@ejemplo.com (Enter para agregar)"
              type="email"
            />
            {emailCfg.enabled && (
              <button
                onClick={() => handleTest('email')}
                disabled={!!testing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
              >
                <Send size={12} />
                {testing === 'email' ? 'Enviando…' : 'Enviar prueba por email'}
              </button>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* WhatsApp */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Phone size={15} className="text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">WhatsApp</h3>
              <Toggle value={waCfg.enabled ?? false} onChange={v => patch({ channels: { whatsapp: { enabled: v } } })} />
              {!config?.whatsapp_available && (
                <span className="text-xs text-gray-400 ml-1">(requiere API Meta configurada en Railway)</span>
              )}
            </div>
            <TagInput
              values={waCfg.phone_numbers || []}
              onChange={phone_numbers => patch({ channels: { whatsapp: { phone_numbers } } })}
              placeholder="573001234567 (Enter para agregar)"
              type="tel"
            />
            {waCfg.enabled && (
              <button
                onClick={() => handleTest('whatsapp')}
                disabled={!!testing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
              >
                <Send size={12} />
                {testing === 'whatsapp' ? 'Enviando…' : 'Enviar prueba por WhatsApp'}
              </button>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* Cooldown */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-700">Anti-spam (cooldown)</p>
              <p className="text-xs text-gray-400 mt-0.5">Tiempo mínimo entre alertas del mismo tipo</p>
            </div>
            <select
              value={cooldown}
              onChange={e => patch({ cooldown_minutes: Number(e.target.value) })}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            >
              <option value={0}>Sin límite</option>
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
              <option value={120}>2 horas</option>
              <option value={480}>8 horas</option>
              <option value={1440}>1 día</option>
            </select>
          </div>

          <div className="border-t border-gray-100" />

          {/* Subscriptions */}
          <div className="space-y-3">
            <button
              onClick={() => setSubsExpanded(v => !v)}
              className="flex items-center gap-2 w-full text-left"
            >
              <h3 className="text-sm font-semibold text-gray-700 flex-1">Tipos de alerta</h3>
              {subsExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {subsExpanded && (
              <div className="space-y-3">
                {SUBSCRIPTION_TYPES.map(({ key, label, desc }) => {
                  const sub = subs[key] || { enabled: false, min_severity: 'high', channels: ['email'] }
                  return (
                    <div key={key} className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <Toggle value={sub.enabled ?? false} onChange={v => updateSubscription(key, { enabled: v })} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800">{label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                        </div>
                      </div>

                      {sub.enabled && (
                        <div className="flex flex-wrap gap-3 pl-13">
                          {/* Severidad mínima */}
                          <div className="flex-1 min-w-[160px]">
                            <label className="text-xs text-gray-500 mb-1 block">Severidad mínima</label>
                            <select
                              value={sub.min_severity || 'high'}
                              onChange={e => updateSubscription(key, { min_severity: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                            >
                              {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>

                          {/* Canales */}
                          <div className="flex-1 min-w-[140px]">
                            <label className="text-xs text-gray-500 mb-1 block">Canales</label>
                            <div className="flex gap-2">
                              {['email', 'whatsapp'].map(ch => {
                                const active = (sub.channels || ['email']).includes(ch)
                                return (
                                  <button
                                    key={ch}
                                    onClick={() => {
                                      const current = sub.channels || ['email']
                                      const updated  = active
                                        ? current.filter(c => c !== ch)
                                        : [...current, ch]
                                      if (updated.length > 0) updateSubscription(key, { channels: updated })
                                    }}
                                    className={`px-2 py-1 text-xs font-medium rounded-lg border transition-colors ${active ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-400'}`}
                                  >
                                    {ch === 'email' ? '✉️ Email' : '💬 WhatsApp'}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`mx-6 mb-6 px-4 py-2.5 rounded-xl text-sm font-medium ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {feedback.msg}
        </div>
      )}

      {saving && (
        <div className="px-6 pb-4 text-xs text-gray-400 flex items-center gap-1.5">
          <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          Guardando…
        </div>
      )}
    </div>
  )
}


// =============================================================================
// SettingsPage — main export
// =============================================================================
export default function SettingsPage() {
  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const track = useTrack();
  useEffect(() => { track('module_view', 'settings') }, [track]);

  const loadSettings = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/settings')
      setSettings(data)
    } catch (err) {
      setError('No se pudo cargar la configuración')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSettings() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">Ajusta las integraciones y preferencias de tu negocio</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      <OrgProfileSection settings={settings} onSaved={loadSettings} />
      <WhatsAppSection settings={settings} onSaved={loadSettings} />
      <AlertsSection />
    </div>
  )
}
