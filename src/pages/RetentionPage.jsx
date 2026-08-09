// =============================================================================
// FERZU POS — RetentionPage
// Módulo de Retención y Reactivación de Clientes
// =============================================================================
import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtCOP(v) {
  if (!v) return '$0'
  return '$' + Number(v).toLocaleString('es-CO')
}
function fmtDays(d) {
  if (d === null || d === undefined) return 'Sin visitas'
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Ayer'
  return `Hace ${d} días`
}
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

const SEGMENT_CONFIG = {
  vip:      { label: 'VIP',       color: 'from-amber-500 to-yellow-400',  badge: 'bg-amber-100 text-amber-800',  icon: '⭐', desc: 'Clientes de alto valor o alta frecuencia' },
  activo:   { label: 'Activos',   color: 'from-emerald-500 to-green-400', badge: 'bg-green-100 text-green-800',  icon: '✅', desc: 'Compraron en los últimos 30 días' },
  en_riesgo:{ label: 'En riesgo', color: 'from-orange-500 to-amber-400',  badge: 'bg-orange-100 text-orange-800',icon: '⚠️', desc: 'Sin visita entre 31 y 60 días' },
  dormido:  { label: 'Dormidos',  color: 'from-gray-500 to-slate-400',    badge: 'bg-gray-100 text-gray-700',    icon: '💤', desc: 'Más de 60 días sin visitar' },
}

const MSG_TYPES = {
  activo:    { label: 'Mensaje de reconocimiento', type: 'vip' },
  vip:       { label: 'Mensaje VIP exclusivo',     type: 'vip' },
  en_riesgo: { label: 'Mensaje de recuperación',   type: 'risk' },
  dormido:   { label: 'Mensaje de reactivación',   type: 'reactivation' },
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function StatCard({ icon, label, value, sub, gradient }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${gradient} text-white shadow-lg`}>
      <div className="text-3xl mb-1">{icon}</div>
      <div className="text-3xl font-bold leading-none">{value}</div>
      <div className="text-sm font-semibold mt-1 opacity-90">{label}</div>
      {sub && <div className="text-xs opacity-70 mt-0.5">{sub}</div>}
    </div>
  )
}

function SegmentBadge({ segment }) {
  const cfg = SEGMENT_CONFIG[segment] || SEGMENT_CONFIG.activo
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.badge}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function MessageModal({ customer, segment, businessName, onClose }) {
  const [message, setMessage]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [copied,  setCopied]    = useState(false)
  const [msgType, setMsgType]   = useState(MSG_TYPES[segment]?.type || 'reactivation')

  const generate = useCallback(async () => {
    setLoading(true)
    setCopied(false)
    try {
      const { data } = await api.post('/retention/generate-message', {
        customer_id: customer.id,
        type: msgType,
        business_name: businessName,
      })
      setMessage(data.message)
    } catch {
      setMessage('Error generando mensaje. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [customer.id, msgType, businessName])

  useEffect(() => { generate() }, [generate])

  const copy = () => {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const whatsapp = () => {
    const phone = customer.phone?.replace(/\D/g, '')
    const url = `https://wa.me/57${phone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  const TYPE_OPTIONS = [
    { value: 'reactivation', label: '💤 Reactivación' },
    { value: 'risk',         label: '⚠️ Recuperación' },
    { value: 'birthday',     label: '🎂 Cumpleaños' },
    { value: 'vip',          label: '⭐ VIP exclusivo' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Mensaje WhatsApp</h3>
            <p className="text-sm text-gray-500">{customer.full_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tipo de mensaje */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Tipo de mensaje</label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setMsgType(opt.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    msgType === opt.value
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mensaje generado */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Mensaje generado</label>
            {loading ? (
              <div className="h-32 rounded-xl bg-gray-50 flex items-center justify-center">
                <div className="flex items-center gap-2 text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
                  <span className="text-sm">Generando con IA...</span>
                </div>
              </div>
            ) : (
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
              />
            )}
          </div>

          {/* Acciones */}
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors disabled:opacity-50">
              🔄 Regenerar
            </button>
            <button
              onClick={copy}
              disabled={loading || !message}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors disabled:opacity-50">
              {copied ? '✅ Copiado' : '📋 Copiar'}
            </button>
            {customer.phone && (
              <button
                onClick={whatsapp}
                disabled={loading || !message}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
                <span>📱</span> WhatsApp
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CustomerRow({ customer, onGenerate }) {
  const cfg = SEGMENT_CONFIG[customer.segment] || SEGMENT_CONFIG.activo
  return (
    <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 text-sm">{customer.full_name}</div>
        <div className="text-xs text-gray-400">{customer.phone || customer.email || '—'}</div>
      </td>
      <td className="px-4 py-3">
        <SegmentBadge segment={customer.segment} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{fmtDays(customer.days_since_last_order)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{customer.order_count}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-800">{fmtCOP(customer.total_spent)}</td>
      <td className="px-4 py-3">
        <button
          onClick={() => onGenerate(customer)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-medium transition-colors">
          💬 Mensaje
        </button>
      </td>
    </tr>
  )
}

function BirthdayCard({ customer, businessName, onGenerate }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-pink-50 border border-pink-100">
      <div className="text-2xl">🎂</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-gray-900 truncate">{customer.full_name}</div>
        <div className="text-xs text-gray-500">
          {customer.days_until ? `En ${customer.days_until} días` : '¡Hoy!'}
          {customer.phone && ` · ${customer.phone}`}
        </div>
      </div>
      <button
        onClick={() => onGenerate({ ...customer, segment: 'activo' })}
        className="shrink-0 px-2.5 py-1.5 rounded-lg bg-pink-500 hover:bg-pink-600 text-white text-xs font-medium transition-colors">
        🎁 Saludar
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function RetentionPage() {
  const { user } = useAuth()
  const [loading,   setLoading]   = useState(true)
  const [segments,  setSegments]  = useState({ activo: [], en_riesgo: [], dormido: [], vip: [] })
  const [stats,     setStats]     = useState({})
  const [birthdays, setBirthdays] = useState({ today: [], this_week: [] })
  const [activeTab, setActiveTab] = useState('todos')
  const [search,    setSearch]    = useState('')
  const [modal,     setModal]     = useState(null)  // { customer, segment }
  const [bizName,   setBizName]   = useState('')

  // Cargar datos
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [segRes, bdRes] = await Promise.all([
        api.get('/retention/segments'),
        api.get('/retention/birthdays'),
      ])
      setSegments(segRes.data.segments || { activo: [], en_riesgo: [], dormido: [], vip: [] })
      setStats(segRes.data.stats || {})
      setBirthdays(bdRes.data || { today: [], this_week: [] })
    } catch (err) {
      console.error('[retention] Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Cargar nombre del negocio
  useEffect(() => {
    api.get('/org/profile').then(r => setBizName(r.data?.name || '')).catch(() => {})
  }, [])

  // Clientes filtrados según tab
  const allCustomers = [
    ...segments.vip,
    ...segments.activo,
    ...segments.en_riesgo,
    ...segments.dormido,
  ]
  const tabCustomers = activeTab === 'todos'
    ? allCustomers
    : segments[activeTab] || []

  const filtered = tabCustomers.filter(c =>
    !search || c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  const hasBirthdays = birthdays.today?.length > 0 || birthdays.this_week?.length > 0

  const TABS = [
    { key: 'todos',    label: 'Todos',     count: allCustomers.length },
    { key: 'vip',      label: '⭐ VIP',    count: segments.vip?.length || 0 },
    { key: 'activo',   label: '✅ Activos', count: segments.activo?.length || 0 },
    { key: 'en_riesgo',label: '⚠️ En riesgo', count: segments.en_riesgo?.length || 0 },
    { key: 'dormido',  label: '💤 Dormidos', count: segments.dormido?.length || 0 },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
          <span>Analizando clientes...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modal generador de mensajes */}
      {modal && (
        <MessageModal
          customer={modal.customer}
          segment={modal.segment}
          businessName={bizName}
          onClose={() => setModal(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">💛 Retención de Clientes</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Identifica quién está en riesgo y reactiva clientes dormidos con mensajes personalizados
            </p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors">
            🔄 Actualizar
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Alertas de cumpleaños */}
        {hasBirthdays && (
          <div className="bg-white rounded-2xl border border-pink-200 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              🎂 Cumpleaños
              {birthdays.today?.length > 0 && (
                <span className="px-2 py-0.5 bg-pink-500 text-white text-xs rounded-full">
                  {birthdays.today.length} HOY
                </span>
              )}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[...birthdays.today, ...birthdays.this_week].slice(0, 6).map(c => (
                <BirthdayCard
                  key={c.id}
                  customer={c}
                  businessName={bizName}
                  onGenerate={customer => setModal({ customer, segment: 'activo' })}
                />
              ))}
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon="⭐"
            label="VIP"
            value={stats.vip || 0}
            sub="Alto valor"
            gradient="from-amber-500 to-yellow-400"
          />
          <StatCard
            icon="✅"
            label="Activos"
            value={stats.activos || 0}
            sub="Últimos 30 días"
            gradient="from-emerald-500 to-green-400"
          />
          <StatCard
            icon="⚠️"
            label="En riesgo"
            value={stats.en_riesgo || 0}
            sub="31-60 días sin venir"
            gradient="from-orange-500 to-amber-400"
          />
          <StatCard
            icon="💤"
            label="Dormidos"
            value={stats.dormidos || 0}
            sub="+60 días sin visitar"
            gradient="from-gray-500 to-slate-500"
          />
        </div>

        {/* Tasa de retención */}
        {stats.retention_rate !== undefined && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Tasa de retención</span>
                <span className="text-2xl font-bold text-gray-900">{stats.retention_rate}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 transition-all"
                  style={{ width: `${stats.retention_rate}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Clientes activos vs total ({stats.activos} de {stats.total_customers})
              </p>
            </div>
            {stats.avg_days_between_visits && (
              <div className="text-center shrink-0">
                <div className="text-2xl font-bold text-gray-900">{stats.avg_days_between_visits}</div>
                <div className="text-xs text-gray-400">días promedio<br />entre visitas</div>
              </div>
            )}
          </div>
        )}

        {/* Tabla de clientes */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Tabs + Búsqueda */}
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
            <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    activeTab === tab.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {tab.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="sm:ml-auto w-full sm:w-56 px-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          </div>

          {/* Tabla */}
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-medium">
                {search ? 'No se encontraron clientes' : 'No hay clientes en este segmento'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Cliente</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Segmento</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Última visita</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Visitas</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Total gastado</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <CustomerRow
                      key={c.id}
                      customer={c}
                      onGenerate={customer => setModal({ customer, segment: customer.segment })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-400">{filtered.length} clientes</span>
              {(activeTab === 'en_riesgo' || activeTab === 'dormido') && filtered.length > 0 && (
                <button
                  onClick={() => {
                    // Generar mensaje para el primer cliente del segmento
                    const first = filtered[0]
                    setModal({ customer: first, segment: first.segment })
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition-colors">
                  💬 Generar campaña para este segmento
                </button>
              )}
            </div>
          )}
        </div>

        {/* Guía rápida */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">💡 Guía de acción rápida</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { segment: 'vip',       action: 'Envía un mensaje exclusivo de agradecimiento. Ofrece un beneficio especial solo para ellos.' },
              { segment: 'activo',    action: 'Son tu base. Mantén el contacto con ofertas frecuentes y programa de fidelización.' },
              { segment: 'en_riesgo', action: 'Actúa rápido. Un mensaje de recuperación ahora puede evitar que se vuelvan dormidos.' },
              { segment: 'dormido',   action: 'Lanza una campaña de reactivación con una oferta irresistible para traerlos de vuelta.' },
            ].map(({ segment, action }) => {
              const cfg = SEGMENT_CONFIG[segment]
              return (
                <div key={segment} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{cfg.icon}</span>
                    <span className="text-xs font-bold text-gray-700">{cfg.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{action}</p>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
