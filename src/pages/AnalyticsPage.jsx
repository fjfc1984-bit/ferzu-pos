// =============================================================================
// FERZU POS — AnalyticsPage  v2
// Dashboard Analítico Ejecutivo
// Fixes v2: endpoint /period (1 query vs 31), usePOS safe, chartData uniforme,
//           empty state global, comparativa período anterior en "mes".
// =============================================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../lib/api'
import { usePOS } from '../context/POSContext'
import {
  TrendingUp, BarChart3, Clock, ShoppingBag,
  DollarSign, CreditCard, Building2, RefreshCw,
  ArrowUpRight, ArrowDownRight, Package,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtCOP(v) {
  if (!v) return '$0'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return '$' + Number(v).toLocaleString('es-CO')
}
function fmtCOPFull(v) {
  return '$' + (Number(v) || 0).toLocaleString('es-CO')
}
function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function currentYear() {
  return new Date().getFullYear()
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}
function monthRange(offset = 0) {
  // offset=0 → mes actual, offset=-1 → mes anterior
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1 + offset
  const target = new Date(y, m - 1, 1)
  const ty = target.getFullYear()
  const tm = target.getMonth() + 1
  const lastDay = new Date(ty, tm, 0).getDate()
  return {
    from: `${ty}-${String(tm).padStart(2,'0')}-01`,
    to:   `${ty}-${String(tm).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
  }
}
function weekRange(offsetWeeks = 0) {
  const now = new Date()
  const day = now.getDay()
  const daysFromMon = day === 0 ? 6 : day - 1
  const mon = new Date(now)
  mon.setDate(now.getDate() - daysFromMon + offsetWeeks * 7)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = d => d.toISOString().split('T')[0]
  return { from: fmt(mon), to: fmt(sun) }
}

const PAYMENT_LABELS = {
  cash: 'Efectivo', card_debit: 'Débito', card_credit: 'Crédito',
  nequi: 'Nequi', daviplata: 'Daviplata', transfer: 'Transferencia',
  mixed: 'Mixto', loyalty_points: 'Puntos', other: 'Otro',
}
const PALETTE = ['#059669','#2563eb','#7c3aed','#d97706','#0891b2','#db2777','#6b7280','#ea580c']

// ---------------------------------------------------------------------------
// SVG Bar Chart nativo — sin dependencias
// ---------------------------------------------------------------------------
function BarChart({ data = [], valueKey = 'revenue', labelKey = 'label', color = '#059669', height = 180 }) {
  if (!data.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-gray-300 text-sm">
        Sin datos para el período
      </div>
    )
  }
  const max    = Math.max(...data.map(d => d[valueKey] || 0), 1)
  const BAR_W  = 32
  const GAP    = data.length > 20 ? 2 : 8
  const CELL   = BAR_W + GAP
  const totalW = data.length * CELL
  const PAD_B  = 20 // espacio etiquetas abajo

  return (
    <div className="overflow-x-auto pb-1">
      <svg
        viewBox={`0 0 ${totalW} ${height + PAD_B}`}
        style={{ minWidth: Math.min(totalW, 600), width: '100%', height: height + PAD_B }}
        preserveAspectRatio="none"
      >
        {data.map((d, i) => {
          const val  = d[valueKey] || 0
          const barH = Math.max((val / max) * height, val > 0 ? 3 : 0)
          const x    = i * CELL
          const y    = height - barH
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={BAR_W} height={barH}
                rx={3} fill={d.isNow ? color : color + 'BB'}
              />
              {barH > 16 && val > 0 && (
                <text x={x + BAR_W / 2} y={y + 11} textAnchor="middle" fontSize="7" fill="white" fontWeight="700">
                  {fmtCOP(val)}
                </text>
              )}
              {data.length <= 31 && (
                <text x={x + BAR_W / 2} y={height + PAD_B - 4} textAnchor="middle" fontSize="8" fill="#9ca3af">
                  {d[labelKey]}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Heatmap de horas (24h)
// ---------------------------------------------------------------------------
function HourHeatmap({ byHour = [] }) {
  if (!byHour.length) return <div className="h-16 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>

  const max   = Math.max(...byHour.map(h => h.revenue || 0), 1)
  const alpha = v => Math.min(1, 0.08 + (v / max) * 0.92)

  const LABELS = ['0','2','4','6','8','10','12','14','16','18','20','22']

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between px-0.5">
        {LABELS.map(l => (
          <span key={l} className="text-[9px] text-gray-400 w-4 text-center">{l}</span>
        ))}
      </div>
      <div className="flex gap-0.5 h-10">
        {byHour.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded relative group cursor-default"
            style={{ backgroundColor: `rgba(5,150,105,${alpha(h.revenue)})` }}
          >
            {h.revenue > 0 && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none shadow-lg">
                {String(i).padStart(2,'0')}:00 · {fmtCOP(h.revenue)} · {h.orders} pedidos
              </div>
            )}
          </div>
        ))}
      </div>
      {(() => {
        const peak = byHour.reduce((a, b) => b.revenue > a.revenue ? b : a, byHour[0])
        const idx  = byHour.indexOf(peak)
        return peak.revenue > 0 ? (
          <p className="text-xs text-gray-500">
            🔥 Hora pico: <strong className="text-gray-800">{String(idx).padStart(2,'0')}:00</strong>
            {' · '}{fmtCOPFull(peak.revenue)}
          </p>
        ) : null
      })()}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Donut de pagos (SVG)
// ---------------------------------------------------------------------------
function PaymentDonut({ payments = [] }) {
  const total = payments.reduce((s, p) => s + p.revenue, 0)
  if (!total) return <div className="h-32 flex items-center justify-center text-gray-300 text-sm">Sin ventas</div>

  const R = 38, CX = 50, CY = 50, SW = 14
  const C = 2 * Math.PI * R
  let offset = 0

  const slices = payments.slice(0, 7).map((p, i) => {
    const pct  = p.revenue / total
    const dash = pct * C
    const s    = { ...p, pct, dash, gap: C - dash, offset, color: PALETTE[i] }
    offset += dash + 0.8
    return s
  })

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0 -rotate-90">
        {slices.map((s, i) => (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none"
            stroke={s.color} strokeWidth={SW}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <div className="space-y-1.5 flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-700">{fmtCOPFull(total)}</p>
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-gray-600 flex-1 truncate">{PAYMENT_LABELS[s.method] || s.method}</span>
            <span className="text-xs font-semibold text-gray-800">{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI Card con comparativa Δ%
// ---------------------------------------------------------------------------
function KPICard({ icon: Icon, label, value, delta, sub, iconColor = 'text-emerald-600', bg = 'bg-emerald-50' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
          <Icon size={16} className={iconColor} />
        </div>
        {delta !== null && delta !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
            delta > 0 ? 'bg-green-50 text-green-700' : delta < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'
          }`}>
            {delta > 0 ? <ArrowUpRight size={11}/> : delta < 0 ? <ArrowDownRight size={11}/> : null}
            {delta > 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>
      <div className="mt-2.5">
        <div className="text-xl font-bold text-gray-900 leading-tight">{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
// Hook seguro: devuelve branchId o null si POSContext no está disponible
function useSafeBranchId() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const ctx = usePOS()
    return ctx?.branchId || null
  } catch {
    return null
  }
}

export default function AnalyticsPage() {
  const branchId = useSafeBranchId()

  const [period,  setPeriod]  = useState('month') // week | month | year
  const [year,    setYear]    = useState(currentYear())
  const [loading, setLoading] = useState(true)
  const [data,    setData]    = useState(null)      // datos período actual
  const [prevData,setPrevData]= useState(null)      // datos período anterior (para Δ%)
  const [monthlyData, setMonthlyData] = useState(null) // solo para "year"
  const [branchCmp,   setBranchCmp]   = useState(null) // comparativa sucursales
  const [error,   setError]   = useState(null)

  const bParam = branchId ? `&branch_id=${branchId}` : ''

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (period === 'week') {
        const cur  = weekRange(0)
        const prev = weekRange(-1)
        const [curRes, prevRes, branchRes] = await Promise.all([
          api.get(`/reports/period?from=${cur.from}&to=${cur.to}${bParam}`),
          api.get(`/reports/period?from=${prev.from}&to=${prev.to}${bParam}`),
          api.get(`/reports/branch-comparison?period=week&date=${todayStr()}`),
        ])
        setData(curRes.data)
        setPrevData(prevRes.data)
        setBranchCmp(branchRes.data)
        setMonthlyData(null)

      } else if (period === 'month') {
        const cur  = monthRange(0)
        const prev = monthRange(-1)
        const [curRes, prevRes, branchRes] = await Promise.all([
          api.get(`/reports/period?from=${cur.from}&to=${cur.to}${bParam}`),
          api.get(`/reports/period?from=${prev.from}&to=${prev.to}${bParam}`),
          api.get(`/reports/branch-comparison?period=month&date=${todayStr()}`),
        ])
        setData(curRes.data)
        setPrevData(prevRes.data)
        setBranchCmp(branchRes.data)
        setMonthlyData(null)

      } else {
        // year
        const [mdRes, branchRes] = await Promise.all([
          api.get(`/reports/monthly?year=${year}${bParam}`),
          api.get(`/reports/branch-comparison?period=year&date=${year}-06-15`),
        ])
        setMonthlyData(mdRes.data)
        setBranchCmp(branchRes.data)
        setData(null)
        setPrevData(null)
      }
    } catch (err) {
      console.error('[analytics] Error:', err)
      setError('No se pudieron cargar los datos. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [period, year, branchId])

  useEffect(() => { load() }, [load])

  // Calcular Δ% entre dato actual y anterior
  function delta(cur, prev) {
    if (!prev || prev === 0) return null
    return Math.round(((cur - prev) / prev) * 100)
  }

  // KPIs
  const kpis = useMemo(() => {
    if (period === 'year' && monthlyData) {
      return {
        revenue:   monthlyData.totals.revenue,
        orders:    monthlyData.totals.orders,
        avgTicket: monthlyData.totals.avg_ticket,
        delta_rev: monthlyData.year_delta_pct,
        label_prev: `vs ${year - 1}`,
      }
    }
    if (data) {
      return {
        revenue:   data.total_revenue,
        orders:    data.total_orders,
        avgTicket: data.avg_ticket,
        delta_rev: prevData ? delta(data.total_revenue, prevData.total_revenue) : null,
        label_prev: period === 'week' ? 'vs semana anterior' : 'vs mes anterior',
      }
    }
    return { revenue: 0, orders: 0, avgTicket: 0, delta_rev: null }
  }, [data, prevData, monthlyData, period, year])

  // Datos para gráfica de barras
  const chartData = useMemo(() => {
    if (period === 'year' && monthlyData) {
      const nowMonth = new Date().getMonth() + 1
      const nowYear  = new Date().getFullYear()
      return monthlyData.months.map(m => ({
        label:   m.month_name,
        revenue: m.revenue,
        orders:  m.orders,
        isNow:   m.month === nowMonth && m.year === nowYear,
      }))
    }
    if (data?.chart) {
      const today = todayStr()
      return data.chart.map(d => ({ ...d, isNow: d.date === today }))
    }
    return []
  }, [data, monthlyData, period])

  const PERIODS = [
    { key: 'week',  label: 'Esta semana' },
    { key: 'month', label: 'Este mes' },
    { key: 'year',  label: 'Este año' },
  ]

  const hasData = period === 'year' ? !!monthlyData : !!data
  const isEmpty = hasData && (
    period === 'year'
      ? monthlyData?.totals?.revenue === 0
      : data?.total_revenue === 0
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📊 Analíticas</h1>
            <p className="text-sm text-gray-500 mt-0.5">Dashboard ejecutivo de rendimiento del negocio</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    period === p.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            {period === 'year' && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl px-2 py-1">
                <button onClick={() => setYear(y => y - 1)} className="w-6 h-6 rounded-lg hover:bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-bold">‹</button>
                <span className="text-sm font-semibold text-gray-700 w-10 text-center">{year}</span>
                <button onClick={() => setYear(y => Math.min(y + 1, currentYear()))} className="w-6 h-6 rounded-lg hover:bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-bold">›</button>
              </div>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors disabled:opacity-50">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-gray-400">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
            <span className="text-sm">Cargando analíticas...</span>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="m-6 bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <p className="text-red-700 font-medium">{error}</p>
          <button onClick={load} className="mt-3 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600">
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && isEmpty && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📉</div>
          <p className="text-lg font-semibold text-gray-500">Sin ventas en este período</p>
          <p className="text-sm mt-1">Registra ventas en el POS para ver tus analíticas aquí.</p>
        </div>
      )}

      {!loading && !error && !isEmpty && hasData && (
        <div className="p-6 space-y-5">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              icon={DollarSign} label="Ingresos"
              value={fmtCOPFull(kpis.revenue)}
              delta={kpis.delta_rev}
              sub={kpis.label_prev}
              iconColor="text-emerald-600" bg="bg-emerald-50"
            />
            <KPICard
              icon={ShoppingBag} label="Órdenes"
              value={(kpis.orders || 0).toLocaleString('es-CO')}
              delta={prevData ? delta(data?.total_orders, prevData.total_orders) : null}
              sub={kpis.label_prev}
              iconColor="text-blue-600" bg="bg-blue-50"
            />
            <KPICard
              icon={TrendingUp} label="Ticket promedio"
              value={fmtCOPFull(kpis.avgTicket)}
              delta={prevData ? delta(data?.avg_ticket, prevData.avg_ticket) : null}
              sub={kpis.label_prev}
              iconColor="text-violet-600" bg="bg-violet-50"
            />
            <KPICard
              icon={BarChart3} label="Promedio diario"
              value={fmtCOP(
                period === 'year'  ? Math.round(kpis.revenue / 365) :
                period === 'week'  ? Math.round(kpis.revenue / 7) :
                Math.round(kpis.revenue / new Date().getDate())
              )}
              iconColor="text-amber-600" bg="bg-amber-50"
            />
          </div>

          {/* Gráfica de barras */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 text-sm">
                {period === 'week'  ? '📅 Ingresos por día — esta semana' :
                 period === 'month' ? '📅 Ingresos por día — este mes' :
                 `📅 Ingresos por mes — ${year}`}
              </h2>
              <span className="text-xs text-gray-400">{fmtCOPFull(kpis.revenue)} total</span>
            </div>
            <BarChart data={chartData} valueKey="revenue" labelKey="label" color="#059669" height={180} />
          </div>

          {/* Horas pico + Métodos de pago (solo semana y mes) */}
          {period !== 'year' && data && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                  <Clock size={15} className="text-orange-500" /> Horas pico
                </h2>
                <HourHeatmap byHour={data.by_hour} />
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                  <CreditCard size={15} className="text-blue-500" /> Métodos de pago
                </h2>
                <PaymentDonut payments={data.by_payment} />
              </div>
            </div>
          )}

          {/* Tabla comparativa año (solo year) */}
          {period === 'year' && monthlyData && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 overflow-x-auto">
              <h2 className="font-bold text-gray-800 text-sm mb-4">📈 Comparativa mensual vs {year - 1}</h2>
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-2 text-xs text-gray-400 font-semibold">Mes</th>
                    <th className="text-right pb-2 text-xs text-gray-400 font-semibold">{year}</th>
                    <th className="text-right pb-2 text-xs text-gray-400 font-semibold">{year - 1}</th>
                    <th className="text-right pb-2 text-xs text-gray-400 font-semibold">Δ%</th>
                    <th className="text-right pb-2 text-xs text-gray-400 font-semibold">Órdenes</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.months.map(m => (
                    <tr key={m.month} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-2 font-medium text-gray-700">{m.month_name}</td>
                      <td className="py-2 text-right font-semibold text-gray-900">{fmtCOPFull(m.revenue)}</td>
                      <td className="py-2 text-right text-gray-400">{fmtCOPFull(m.prev_revenue)}</td>
                      <td className="py-2 text-right">
                        {m.delta_pct !== null ? (
                          <span className={`text-xs font-bold ${m.delta_pct > 0 ? 'text-green-600' : m.delta_pct < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {m.delta_pct > 0 ? '+' : ''}{m.delta_pct}%
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="py-2 text-right text-gray-500">{m.orders}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="py-2.5 font-bold text-gray-900">Total {year}</td>
                    <td className="py-2.5 text-right font-bold text-emerald-600">{fmtCOPFull(monthlyData.totals.revenue)}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-400">{fmtCOPFull(monthlyData.prev_totals?.revenue)}</td>
                    <td className="py-2.5 text-right">
                      {monthlyData.year_delta_pct !== null && (
                        <span className={`text-sm font-bold ${monthlyData.year_delta_pct > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {monthlyData.year_delta_pct > 0 ? '+' : ''}{monthlyData.year_delta_pct}%
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-gray-700">{monthlyData.totals.orders}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Top 10 productos */}
          {(() => {
            const prods = data?.top_products || []
            if (!prods.length) return null
            return (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                  <Package size={15} className="text-violet-500" /> Top 10 productos
                </h2>
                <div className="space-y-2.5">
                  {prods.map((p, i) => {
                    const pct = (p.revenue / (prods[0]?.revenue || 1)) * 100
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                              <span className="text-xs text-gray-400">{p.qty} uds</span>
                              <span className="text-sm font-semibold text-gray-900">{fmtCOPFull(p.revenue)}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-brand-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Comparativa por sucursal */}
          {branchCmp?.branches?.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                <Building2 size={15} className="text-blue-500" /> Comparativa por sucursal
              </h2>
              <div className="space-y-3">
                {branchCmp.branches.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-xl bg-brand-50 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                      #{b.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-800 truncate">{b.name}</span>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <span className="text-xs text-gray-400">{b.share_pct}%</span>
                          <span className="text-sm font-bold text-gray-900">{fmtCOPFull(b.revenue)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${b.share_pct}%`, backgroundColor: PALETTE[i] }} />
                      </div>
                      <div className="flex gap-3 mt-0.5">
                        <span className="text-[10px] text-gray-400">{b.orders} órdenes</span>
                        <span className="text-[10px] text-gray-400">Ticket prom: {fmtCOP(b.avg_ticket)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
