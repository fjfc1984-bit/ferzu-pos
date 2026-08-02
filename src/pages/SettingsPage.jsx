// =============================================================================
// FERZU POS — SettingsPage
// Configuración de la organización: WhatsApp Business API
// =============================================================================

import { useState, useEffect } from 'react'
import { MessageSquare, CheckCircle2, XCircle, Send, Info, ExternalLink } from 'lucide-react'
import api from '../api'

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
// SettingsPage — main export
// =============================================================================
export default function SettingsPage() {
  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

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

      <WhatsAppSection settings={settings} onSaved={loadSettings} />
    </div>
  )
}
