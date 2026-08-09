// =============================================================================
// FERZU POS — Panel de Alertas
// Historial de system_alerts con filtros, badges de severidad y gestión.
// =============================================================================
import React, { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, AlertCircle, Info, CheckCircle2,
  Bell, BellOff, Filter, RefreshCw, CheckCheck,
  Clock, ShieldAlert, XCircle, ChevronDown, ChevronUp,
  Package, DollarSign, Zap, FileText,
} from 'lucide-react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../lib/api'

// =============================================================================
// Configuración visual de severidades
// =============================================================================
const SEVERITY_CONFIG = {
  critical: {
    label: 'Crítica',
    color: 'text-red-600',
    bg:    'bg-red-50',
    border:'border-red-200',
    badge: 'bg-red-100 text-red-700',
    icon:  <XCircle size={16} className="text-red-600" />,
    dot:   'bg-red-500',
  },
  high: {
    label: 'Alta',
    color: 'text-orange-600',
    bg:    'bg-orange-50',
    border:'border-orange-200',
    badge: 'bg-orange-100 text-orange-700',
    icon:  <AlertTriangle size={16} className="text-orange-500" />,
    dot:   'bg-orange-500',
  },
  medium: {
    label: 'Media',
    color: 'text-yellow-600',
    bg:    'bg-yellow-50',
    border:'border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-700',
    icon:  <AlertCircle size={16} className="text-yellow-500" />,
    dot:   'bg-yellow-400',
  },
  low: {
    label: 'Baja',
    color: 'text-blue-600',
    bg:    'bg-blue-50',
    border:'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    icon:  <Info size={16} className="text-blue-500" />,
    dot:   'bg-blue-400',
  },
}

// =============================================================================
// Configuración visual de tipos de alerta
// =============================================================================
const TYPE_CONFIG = {
  cash_discrepancy: { label: 'Descuadre de caja',    icon: <DollarSign size={14} /> },
  stock_anomaly:    { label: 'Anomalía de inventario', icon: <Package size={14} /> },
  stock_low:        { label: 'Stock bajo',             icon: <Package size={14} /> },
  dian_error:       { label: 'Error DIAN',             icon: <FileText size={14} /> },
  system:           { label: 'Sistema',                icon: <Zap size={14} /> },
}

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || { label: type?.replace(/_/g, ' ') || 'Alerta', icon: <Bell size={14} /> }
}

// =============================================================================
// Componente AlertCard
// =============================================================================
function AlertCard({ alert, onResolve }) {
  const [expanded, setExpanded] = useState(false)
  const [resolving, setResolving] = useState(false)

  const sev  = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low
  const type = getTypeConfig(alert.alert_type)
  const createdAt = alert.created_at ? parseISO(alert.created_at) : new Date()

  const handleResolve = async (e) => {
    e.stopPropagation()
    setResolving(true)
    await onResolve(alert.id)
    setResolving(false)
  }

  const hasData = alert.data && Object.keys(alert.data).length > 0

  return (
    <div className={`border rounded-xl transition-all ${sev.border} ${alert.is_resolved ? 'opacity-60' : sev.bg}`}>
      {/* ── Header de la card ── */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => hasData && setExpanded(p => !p)}
      >
        {/* Indicador de severidad */}
        <div className="mt-0.5 shrink-0">{sev.icon}</div>

        {/* Contenido principal */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {/* Badge severidad */}
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${sev.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
              {sev.label}
            </span>
            {/* Badge tipo */}
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
              {type.icon}
              {type.label}
            </span>
            {/* Dispatched */}
            {alert.dispatched && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <Bell size={11} /> Notificado
              </span>
            )}
            {/* Resuelta */}
            {alert.is_resolved && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={11} /> Resuelta
              </span>
            )}
          </div>

          <p className="text-sm font-semibold text-gray-900 leading-snug">{alert.title}</p>
          {alert.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alert.description}</p>
          )}

          {/* Tiempo */}
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
            <Clock size={11} />
            <span title={format(createdAt, "d 'de' MMMM yyyy HH:mm", { locale: es })}>
              {formatDistanceToNow(createdAt, { addSuffix: true, locale: es })}
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          {!alert.is_resolved && (
            <button
              onClick={handleResolve}
              disabled={resolving}
              className="flex items-center gap-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              {resolving
                ? <RefreshCw size={12} className="animate-spin" />
                : <CheckCircle2 size={12} />}
              {resolving ? 'Marcando…' : 'Resolver'}
            </button>
          )}
          {hasData && (
            <button className="text-gray-400 hover:text-gray-600 p-1">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* ── Datos adicionales expandibles ── */}
      {expanded && hasData && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Detalles</p>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {Object.entries(alert.data).map(([key, val]) => (
              <div key={key} className="flex justify-between items-center px-3 py-1.5 text-xs">
                <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-medium text-gray-800 max-w-[55%] text-right break-words">
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Componente principal AlertsPage
// =============================================================================
export default function AlertsPage() {
  const [alerts,    setAlerts]    = useState([])
  const [summary,   setSummary]   = useState({ total: 0, critical: 0, high: 0, medium: 0, low: 0 })
  const [loading,   setLoading]   = useState(true)
  const [resolving, setResolving] = useState(false)
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)

  // Filtros
  const [showResolved, setShowResolved] = useState(false)
  const [filterSev,    setFilterSev]    = useState('')
  const [filterType,   setFilterType]   = useState('')

  const LIMIT = 20

  // ── Cargar alertas ──────────────────────────────────────────────────────
  const loadAlerts = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        resolved: showResolved ? 'true' : 'false',
        page:     p,
        limit:    LIMIT,
      })
      if (filterSev)  params.set('severity',   filterSev)
      if (filterType) params.set('alert_type', filterType)

      const [alertsRes, summaryRes] = await Promise.all([
        api.get(`/alerts?${params}`),
        api.get('/alerts/summary'),
      ])

      setAlerts(alertsRes.data.alerts)
      setTotal(alertsRes.data.total)
      setPage(p)
      setSummary(summaryRes.data)
    } catch (err) {
      console.error('Error cargando alertas', err)
    } finally {
      setLoading(false)
    }
  }, [showResolved, filterSev, filterType])

  useEffect(() => { loadAlerts(1) }, [loadAlerts])

  // ── Marcar una alerta como resuelta ─────────────────────────────────────
  const handleResolve = useCallback(async (id) => {
    await api.patch(`/alerts/${id}/resolve`)
    await loadAlerts(page)
  }, [page, loadAlerts])

  // ── Resolver todas ──────────────────────────────────────────────────────
  const handleResolveAll = async () => {
    setResolving(true)
    try {
      const body = {}
      if (filterSev)  body.severity   = filterSev
      if (filterType) body.alert_type = filterType
      await api.patch('/alerts/resolve-all', body)
      await loadAlerts(1)
    } finally {
      setResolving(false)
    }
  }

  const unresolved = summary.total

  // =============================================================================
  // Render
  // =============================================================================
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={22} className="text-brand-600" />
            <h1 className="text-xl font-bold text-gray-900">Panel de Alertas</h1>
            {unresolved > 0 && (
              <span className="flex items-center justify-center w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full">
                {unresolved > 99 ? '99+' : unresolved}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Monitoreo de eventos críticos de tu negocio
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadAlerts(page)}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>

          {!showResolved && unresolved > 0 && (
            <button
              onClick={handleResolveAll}
              disabled={resolving}
              className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {resolving
                ? <RefreshCw size={14} className="animate-spin" />
                : <CheckCheck size={14} />}
              Resolver todas
            </button>
          )}
        </div>
      </div>

      {/* ── Resumen por severidad ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['critical', 'high', 'medium', 'low']).map(sev => {
          const cfg = SEVERITY_CONFIG[sev]
          const count = summary[sev] || 0
          const isActive = filterSev === sev
          return (
            <button
              key={sev}
              onClick={() => setFilterSev(isActive ? '' : sev)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                isActive
                  ? `${cfg.bg} ${cfg.border} ring-2 ring-offset-1 ring-current ${cfg.color}`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg} shrink-0`}>
                {cfg.icon}
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-500">{cfg.label}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
        <Filter size={14} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">Filtros</span>

        {/* Tipo */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="text-sm border border-gray-200 bg-white rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>

        {/* Mostrar resueltas */}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          {showResolved ? <BellOff size={14} /> : <Bell size={14} />}
          {showResolved ? 'Mostrando resueltas' : 'Mostrar resueltas'}
        </label>

        {/* Limpiar filtros */}
        {(filterSev || filterType || showResolved) && (
          <button
            onClick={() => { setFilterSev(''); setFilterType(''); setShowResolved(false) }}
            className="text-xs text-brand-600 hover:text-brand-800 font-medium ml-auto"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Lista de alertas ── */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 size={48} className="mx-auto text-green-300 mb-3" />
          <p className="text-lg font-semibold text-gray-600">
            {showResolved ? 'No hay alertas resueltas' : '¡Todo en orden!'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {showResolved
              ? 'No se han resuelto alertas con los filtros actuales.'
              : 'No tienes alertas pendientes en este momento.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <AlertCard key={alert.id} alert={alert} onResolve={handleResolve} />
          ))}
        </div>
      )}

      {/* ── Paginación ── */}
      {total > LIMIT && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total} alertas
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => loadAlerts(page - 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              ← Anterior
            </button>
            <button
              disabled={page * LIMIT >= total}
              onClick={() => loadAlerts(page + 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
