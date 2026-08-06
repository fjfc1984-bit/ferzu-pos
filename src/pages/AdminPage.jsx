// =============================================================================
// FERZU POS — AdminPage
// Panel de super-administrador: todos los usuarios/orgs registrados,
// métricas de uso, último login, plan.
// Solo visible para fjfc1984@gmail.com
// =============================================================================

import { useState, useEffect } from 'react'
import {
  Users, Building2, ShoppingBag, LayoutGrid,
  RefreshCw, TrendingUp, Clock, CheckCircle2, XCircle,
  Scissors, UtensilsCrossed, Wrench, ShoppingCart, Store,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { api }     from '../lib/api.js'

const ADMIN_EMAIL = 'fjfc1984@gmail.com'

const PLAN_COLORS = {
  free:        'bg-gray-100 text-gray-600',
  pos_basic:   'bg-blue-100 text-blue-700',
  barbershop:  'bg-purple-100 text-purple-700',
  restaurant:  'bg-orange-100 text-orange-700',
  workshop:    'bg-yellow-100 text-yellow-700',
  minimarket:  'bg-green-100 text-green-700',
  pro:         'bg-emerald-100 text-emerald-700',
  enterprise:  'bg-rose-100 text-rose-700',
}

const BTYPE_ICON = {
  barbershop:  Scissors,
  restaurant:  UtensilsCrossed,
  workshop:    Wrench,
  minimarket:  ShoppingCart,
  generic:     Store,
}

const COP = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

function timeAgo(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 60)  return `hace ${mins}m`
  if (hours < 24) return `hace ${hours}h`
  return `hace ${days}d`
}

// ── Tarjeta de métrica global ─────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

// ── Fila de usuario en la tabla ───────────────────────────────────────────────
function UserRow({ u, isMe }) {
  const BTypeIcon = BTYPE_ICON[u.business_type] || Store
  const loginAgo  = timeAgo(u.last_login_at)
  const regDate   = u.reg_date ? new Date(u.reg_date).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' }) : '—'

  // Actividad: alta si tiene órdenes, media si abrió caja, baja si nada
  const actLevel = u.total_orders > 0 ? 'alta' : u.total_sessions > 0 ? 'media' : 'baja'
  const actColor = { alta: 'text-emerald-600', media: 'text-amber-500', baja: 'text-red-400' }[actLevel]
  const actDot   = { alta: 'bg-emerald-500',   media: 'bg-amber-400',   baja: 'bg-red-400'   }[actLevel]

  return (
    <tr className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isMe ? 'opacity-50' : ''}`}>
      {/* Negocio */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <BTypeIcon size={14} className="text-gray-500" />
          </div>
          <div>
            <p className="font-medium text-gray-900 text-sm leading-tight">{u.business_name}</p>
            <p className="text-xs text-gray-400">{u.owner_email}</p>
          </div>
        </div>
      </td>

      {/* Plan */}
      <td className="py-3 px-4">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[u.plan_id] || PLAN_COLORS.free}`}>
          {u.plan_id || 'free'}
        </span>
      </td>

      {/* Registro */}
      <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{regDate}</td>

      {/* Último login */}
      <td className="py-3 px-4">
        {u.last_login_at ? (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-500" />
            <span className="text-xs text-gray-600">{loginAgo}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <XCircle size={13} className="text-gray-300" />
            <span className="text-xs text-gray-400">Sin registro</span>
          </div>
        )}
      </td>

      {/* Métricas */}
      <td className="py-3 px-4 text-center">
        <span className={`text-sm font-semibold ${u.total_orders > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
          {u.total_orders}
        </span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className={`text-sm ${u.total_products > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
          {u.total_products}
        </span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className={`text-sm ${u.total_sessions > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
          {u.total_sessions}
        </span>
      </td>

      {/* Actividad */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${actDot}`} />
          <span className={`text-xs font-medium capitalize ${actColor}`}>{actLevel}</span>
        </div>
      </td>
    </tr>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user } = useAuth()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // Guard: solo Fernando puede ver esto
  if (user?.email !== ADMIN_EMAIL) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-medium">Acceso restringido</p>
        </div>
      </div>
    )
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/admin/users')
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  // Filtrar fuera la cuenta del admin y QA para las métricas
  const external = (data?.users || []).filter(u =>
    u.owner_email !== ADMIN_EMAIL && !u.owner_email?.includes('qa') && !u.owner_email?.includes('test')
  )
  const all = data?.users || []

  const totals = {
    orgs:     external.length,
    orders:   external.reduce((s, u) => s + u.total_orders, 0),
    products: external.reduce((s, u) => s + u.total_products, 0),
    active:   external.filter(u => u.total_orders > 0 || u.total_sessions > 0).length,
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-brand-600" />
            Panel de Administración
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Todos los negocios registrados en FERZU POS
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Métricas globales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard icon={Building2}    label="Negocios externos"  value={totals.orgs}     color="bg-blue-100 text-blue-600" />
        <MetricCard icon={TrendingUp}   label="Activos (con uso)"  value={totals.active}   color="bg-emerald-100 text-emerald-600" />
        <MetricCard icon={ShoppingBag}  label="Órdenes totales"    value={totals.orders}   color="bg-orange-100 text-orange-600" />
        <MetricCard icon={LayoutGrid}   label="Productos cargados" value={totals.products} color="bg-purple-100 text-purple-600" />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <RefreshCw size={24} className="animate-spin" />
            <p className="text-sm">Cargando usuarios…</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-600 text-sm">
          {error}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Negocio</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Registro</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <div className="flex items-center gap-1"><Clock size={11} />Último login</div>
                  </th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Órdenes</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Productos</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Cajas</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actividad</th>
                </tr>
              </thead>
              <tbody>
                {all.map(u => (
                  <UserRow
                    key={u.org_id}
                    u={u}
                    isMe={u.owner_email === ADMIN_EMAIL}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-50 text-xs text-gray-400">
            {all.length} organizaciones registradas · Actualizado {new Date().toLocaleTimeString('es-CO')}
          </div>
        </div>
      )}
    </div>
  )
}
