// =============================================================================
// FERZU POS — AnalyticsPage
// Dashboard Analítico Ejecutivo
// Período: Semana / Mes / Año — gráficas SVG nativas
// =============================================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../lib/api'
import { usePOS } from '../context/POSContext'
import {
  TrendingUp, TrendingDown, BarChart3, Clock,
  ShoppingBag, DollarSign, CreditCard, Building2,
  RefreshCw, ArrowUpRight, ArrowDownRight, Package,
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
function currentWeekMonday() {
  const now = new Date()
  const day = now.getDay()
  const daysFromMon = day === 0 ? 6 : day - 1
  const mon = new Date(now)
  mon.setDate(now.getDate() - daysFromMon)
  return mon.toISOString().split('T')[0]
}

const PAYMENT_LABELS = {
  cash: 'Efectivo', card_debit: 'Débito', card_credit: 'Crédito',
  nequi: 'Nequi', daviplata: 'Daviplata', transfer: 'Transferencia',
  mixed: 'Mixto', loyalty_points: 'Puntos', other: 'Otro',
}
const PAYMENT_COLORS = ['#059669','#2563eb','#7c3aed','#d97706','#0891b2','#db2777','#6b7280','#ea580c','#ca8a04']

const WEEKDAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const HOUR_LABELS = ['12a','2a','4a','6a','8a','10a','12p','2p','4p','6p','8p','10p']

// ---------------------------------------------------------------------------
// SVG Bar Chart
// ---------------------------------------------------------------------------
function BarChart({ data, valueKey = 'revenue', labelKey = 'label', color = '#059669', height = 160 }) {
  if (!data?.length) return <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>

  const max = Math.max(...data.map(d => d[valueKey] || 0), 1)
  const W = 100 / data.length
  const BAR_AREA = height - 24 // dejar 24px para etiquetas abajo

  return (
    <svg viewBox={`0 0 ${data.length * 40} ${height + 8}`} className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const val   = d[valueKey] || 0
        const barH  = (val / max) * BAR_AREA
        const x     = i * 40 + 4
        const y     = BAR_AREA - barH
        const label = d[labelKey] || ''
        const isNow = d.isNow
        return (
          <g key={i}>
            {/* Bar */}
            <rect
              x={x} y={y} width={32} height={Math.max(barH, 2)}
              rx={4} ry={4}
              fill={isNow ? color : color + '99'}
            />
            {/* Value label on top */}
            {val > 0 && barH > 20 && (
              <text x={x + 16} y={y + 12} textAnchor="middle" fontSize="8" fill="white" fontWeight="600">
                {fmtCOP(val)}
              </text>
            )}
            {/* X label */}
            <text x={x + 16} y={height + 4} textAnchor="middle" fontSize="9" fill="#9ca3af">
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Heatmap de horas (24h × días en la semana, o solo 1 día)
// ---------------------------------------------------------------------------
function HourHeatmap({ byHour }) {
  if (!byHour?.length) return <div className="h-20 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>

  const max = Math.max(...byHour.map(h => h.revenue || 0), 1)
  const cellW = 100 / 24

  const alpha = (val) => Math.min(1, 0.1 + (val / max) * 0.9)

  return (
    <div className="space-y-1">
      {/* Hora labels */}
      <div className="flex">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-gray-400" style={{ marginLeft: i === 0 ? '0' : '' }}>
            {HOUR_LABELS[i]}
          </div>
        ))}
      </div>
      {/* Heatmap row */}
      <div className="flex gap-0.5 h-10">
        {byHour.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm relative group cursor-default"
            style={{ backgroundColor: `rgba(5, 150, 105, ${alpha(h.revenue)})` }}
            title={`${String(i).padStart(2,'0')}:00 — ${fmtCOPFull(h.revenue)} (${h.orders} pedidos)`}
          >
            {h.revenue > 0 && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                {String(i).padStart(2,'0')}:00 · {fmtCOP(h.revenue)}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Peak hour */}
      {(() => {
        const peak = byHour.reduce((a, b) => (b.revenue > a.revenue ? b : a), { hour: 0, revenue: 0 })
        if (!peak.revenue) return null
        const idx = byHour.indexOf(peak)
        return (
          <p className="text-xs text-gray-500 mt-1">
            🔥 Hora pico: <strong className="text-gray-700">{String(idx).padStart(2,'0')}:00</strong> — {fmtCOPFull(peak.revenue)}
          </p>
        )
      })()}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Donut de métodos de pago
// ---------------------------------------------------------------------------
function PaymentDonut({ payments }) {
  if (!payments?.length) return <div className="h-32 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>

  const total = payments.reduce((s, p) => s + p.revenue, 0)
  if (!total) return <div className="h-32 flex items-center justify-center text-gray-300 text-sm">Sin ventas</div>

  const R = 40, CX = 50, CY = 50, strokeW = 16
  let offset = 0
  const slices = payments.slice(0, 6).map((p, i) => {
    const pct  = p.revenue / total
    const dash = pct * 2 * Math.PI * R
    const gap  = 2 * Math.PI * R - dash
    const slice = { ...p, pct, dash, gap, offset, color: PAYMENT_COLORS[i] || '#6b7280' }
    offset += dash + 1
    return slice
  })

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0">
        {slices.map((s, i) => (
          <circle
            key={i}
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeW}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
            transform="rotate(-90 50 50)"
          />
        ))}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#111827">
          {fmtCOP(total)}
        </text>
        <text x={CX} y={CY + 8} textAnchor="middle" fontSize="7" fill="#9ca3af">total</text>
      </svg>
      <div className="space-y-1.5 flex-1 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-gray-600 flex-1 truncate">{PAYMENT_LABELS[s.method] || s.label || s.method}</span>
            <span className="text-xs font-semibold text-gray-800">{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
function KPICard({ icon: Icon, label, value, delta, sub, iconColor = 'text-brand-600', bg = 'bg-brand-50' }) {
  const up = delta > 0
  const dn = delta < 0
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
          <Icon size={18} className={iconColor} />
        </div>
        {delta !== null && delta !== undefined && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-full ${
            up ? 'bg-green-50 text-green-700' : dn ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'
          }`}>
            {up ? <ArrowUpRight size={12} /> : dn ? <ArrowDownRight size={12} /> : null}
            {delta > 0 ? '+' : ''}{delta}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function AnalyticsPage() {
  const { branchId } = usePOS()
  const [period,   setPeriod]   = useState('month') // week | month | year
  const [year,     setYear]     = useState(currentYear())
  const [loading,  setLoading]  = useState(true)

  // Datos por período
  const [weekData,    setWeekData]    = useState(null)
  const [monthlyData, setMonthlyData] = useState(null)
  const [branchData,  setBranchData]  = useState(null)
  const [dailyData,   setDailyData]   = useState(null) // para semana actual (7 días)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = branchId ? `&branch_id=${branchId}` : ''

      if (period === 'week') {
        const monday = currentWeekMonday()
        const [wd, bd] = await Promise.all([
          api.get(`/reports/weekly?week_start=${monday}${params}`),
          api.get(`/reports/branch-comparison?period=week&date=${todayStr()}`),
        ])
        setWeekData(wd.data)
        setBranchData(bd.data)
        // Combinar datos de los 7 días del reporte semanal para heatmap y pagos
        const combined = mergeDailyReports(wd.data?.current || [])
        setDailyData(combined)
      } else if (period === 'month') {
        const [rep, bd] = await Promise.all([
          api.get(`/reports/weekly?week_start=${currentWeekMonday()}${params}`),
          api.get(`/reports/branch-comparison?period=month&date=${todayStr()}`),
        ])
        // Para "mes": cargamos el mes completo via daily (día a día) — usamos monthly endpoint
        const today = todayStr()
        const y = today.split('-')[0]
        const m = today.split('-')[1]
        const daysInMonth = new Date(parseInt(y), parseInt(m), 0).getDate()
        // Cargamos el reporte del mes actual: cada día
        const monthStart = `${y}-${m}-01`
        const dayPromises = []
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${y}-${m}-${String(d).padStart(2, '0')}`
          if (dateStr > today) break
          dayPromises.push(api.get(`/reports/daily?date=${dateStr}${params}`).then(r => r.data).catch(() => null))
        }
        const days = (await Promise.all(dayPromises)).filter(Boolean)
        const combined = mergeDailyReports(days)
        const chartDays = days.map((d, i) => ({
          label: String(i + 1),
          revenue: d.total_revenue,
          orders: d.total_orders,
          isNow: i === days.length - 1,
        }))
        setDailyData({ ...combined, chart: chartDays })
        setBranchData(bd.data)
        setWeekData(rep.data)
      } else {
        // year
        const [md, bd] = await Promise.all([
          api.get(`/reports/monthly?year=${year}${params}`),
          api.get(`/reports/branch-comparison?period=year&date=${year}-06-15`),
        ])
        setMonthlyData(md.data)
        setBranchData(bd.data)
        setDailyData(null)
        setWeekData(null)
      }
    } catch (err) {
      console.error('[analytics] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [period, year, branchId])

  useEffect(() => { load() }, [load])

  // Combinar N reportes diarios en uno solo
  function mergeDailyReports(reports) {
    const combined = {
      total_revenue: 0, total_orders: 0, total_discount: 0, total_tax: 0,
      by_hour: Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 })),
      by_payment: {},
      top_products: {},
    }
    for (const r of reports) {
      if (!r) continue
      combined.total_revenue  += r.total_revenue  || 0
      combined.total_orders   += r.total_orders   || 0
      combined.total_discount += r.total_discount || 0
      combined.total_tax      += r.total_tax      || 0
      for (const h of r.by_hour || []) {
        combined.by_hour[h.hour].orders  += h.orders
        combined.by_hour[h.hour].revenue += h.revenue
      }
      for (const p of r.by_payment || []) {
        if (!combined.by_payment[p.method]) combined.by_payment[p.method] = { method: p.method, label: p.label, orders: 0, revenue: 0 }
        combined.by_payment[p.method].orders  += p.orders
        combined.by_payment[p.method].revenue += p.revenue
      }
      for (const prod of r.top_products || []) {
        const key = prod.name
        if (!combined.top_products[key]) combined.top_products[key] = { name: prod.name, qty: 0, revenue: 0 }
        combined.top_products[key].qty     += prod.qty
        combined.top_products[key].revenue += prod.revenue
      }
    }
    combined.by_payment_arr = Object.values(combined.by_payment).sort((a, b) => b.revenue - a.revenue)
    combined.top_products_arr = Object.values(combined.top_products)
      .sort((a, b) => b.revenue - a.revenue).slice(0, 10)
      .map((p, i) => ({ ...p, rank: i + 1 }))
    combined.avg_ticket = combined.total_orders > 0 ? Math.round(combined.total_revenue / combined.total_orders) : 0
    return combined
  }

  // Datos para la gráfica de barras según período
  const chartData = useMemo(() => {
    if (period === 'year' && monthlyData) {
      return monthlyData.months.map(m => ({
        label: m.month_name,
        revenue: m.revenue,
        orders: m.orders,
        isNow: m.month === new Date().getMonth() + 1 && m.year === new Date().getFullYear(),
      }))
    }
    if (period === 'week' && weekData) {
      const days = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
      return (weekData.current || []).map((d, i) => ({
        label: days[i],
        revenue: d.total_revenue,
        orders: d.total_orders,
        isNow: i === new Date().getDay() - 1,
      }))
    }
    if (period === 'month' && dailyData?.chart) {
      return dailyData.chart
    }
    return []
  }, [period, monthlyData, weekData, dailyData])

  // KPIs principales
  const kpis = useMemo(() => {
    if (period === 'year' && monthlyData) {
      return {
        revenue:    monthlyData.totals.revenue,
        orders:     monthlyData.totals.orders,
        avgTicket:  monthlyData.totals.avg_ticket,
        delta:      monthlyData.year_delta_pct,
        prevRevenue: monthlyData.prev_totals?.revenue,
      }
    }
    if ((period === 'week') && weekData) {
      const cur  = weekData.comparison
      return {
        revenue:   cur?.revenue?.current  || 0,
        orders:    cur?.orders?.current   || 0,
        avgTicket: cur?.avg_ticket?.current || 0,
        delta:     cur?.revenue?.delta_pct ?? null,
        prevRevenue: cur?.revenue?.prev || 0,
      }
    }
    if (period === 'month' && dailyData) {
      return {
        revenue:   dailyData.total_revenue,
        orders:    dailyData.total_orders,
        avgTicket: dailyData.avg_ticket,
        delta:     null,
        prevRevenue: null,
      }
    }
    return { revenue: 0, orders: 0, avgTicket: 0, delta: null }
  }, [period, monthlyData, weekData, dailyData])

  const activeData = period === 'year' ? null : dailyData
  const payments   = activeData?.by_payment_arr || []
  const topProducts = activeData?.top_products_arr || (monthlyData ? [] : [])
  const byHour     = activeData?.by_hour || []

  const PERIODS = [
    { key: 'week',  label: 'Esta semana' },
    { key: 'month', label: 'Este mes' },
    { key: 'year',  label: 'Este año' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📊 Analíticas</h1>
            <p className="text-sm text-gray-500 mt-0.5">Dashboard ejecutivo de rendimiento del negocio</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Selector de período */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    period === p.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Selector de año (solo en year) */}
            {period === 'year' && (
              <div className="flex items-center gap-1">
                <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 text-sm">‹</button>
                <span className="text-sm font-semibold text-gray-700 w-10 text-center">{year}</span>
                <button onClick={() => setYear(y => Math.min(y + 1, currentYear()))} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 text-sm">›</button>
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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-gray-400">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
            <span>Cargando analíticas...</span>
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-5">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={DollarSign}
              label="Ingresos"
              value={fmtCOPFull(kpis.revenue)}
              delta={kpis.delta}
              sub={kpis.prevRevenue ? `vs ${fmtCOP(kpis.prevRevenue)} período anterior` : undefined}
              iconColor="text-emerald-600"
              bg="bg-emerald-50"
            />
            <KPICard
              icon={ShoppingBag}
              label="Órdenes"
              value={kpis.orders.toLocaleString('es-CO')}
              iconColor="text-blue-600"
              bg="bg-blue-50"
            />
            <KPICard
              icon={TrendingUp}
              label="Ticket promedio"
              value={fmtCOPFull(kpis.avgTicket)}
              iconColor="text-violet-600"
              bg="bg-violet-50"
            />
            <KPICard
              icon={BarChart3}
              label="Promedio diario"
              value={fmtCOP(
                period === 'year'
                  ? Math.round(kpis.revenue / 365)
                  : period === 'week'
                  ? Math.round(kpis.revenue / 7)
                  : Math.round(kpis.revenue / new Date().getDate())
              )}
              iconColor="text-amber-600"
              bg="bg-amber-50"
            />
          </div>

          {/* Gráfica principal de ingresos */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">
                {period === 'week' ? '📅 Ventas por día (esta semana)' :
                 period === 'month' ? '📅 Ventas por día (este mes)' :
                 `📅 Ventas por mes (${year})`}
              </h2>
              <span className="text-sm text-gray-400">{fmtCOPFull(kpis.revenue)} total</span>
            </div>
            <BarChart data={chartData} valueKey="revenue" labelKey="label" color="#059669" height={180} />
          </div>

          {/* Segunda fila: Horas pico + Métodos de pago */}
          {period !== 'year' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Horas pico */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Clock size={16} className="text-orange-500" />
                  Horas pico
                </h2>
                <HourHeatmap byHour={byHour} />
              </div>

              {/* Métodos de pago */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <CreditCard size={16} className="text-blue-500" />
                  Métodos de pago
                </h2>
                <PaymentDonut payments={payments} />
              </div>
            </div>
          )}

          {/* Año: gráfica mensual de comparativa */}
          {period === 'year' && monthlyData && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800">📈 Comparativa mensual vs {year - 1}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
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
                      <tr key={m.month} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 font-medium text-gray-700">{m.month_name}</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{fmtCOPFull(m.revenue)}</td>
                        <td className="py-2 text-right text-gray-400">{fmtCOPFull(m.prev_revenue)}</td>
                        <td className="py-2 text-right">
                          {m.delta_pct !== null ? (
                            <span className={`text-xs font-semibold ${m.delta_pct > 0 ? 'text-green-600' : m.delta_pct < 0 ? 'text-red-500' : 'text-gray-400'}`}>
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
                      <td className="py-2 font-bold text-gray-900">Total</td>
                      <td className="py-2 text-right font-bold text-emerald-600">{fmtCOPFull(monthlyData.totals.revenue)}</td>
                      <td className="py-2 text-right font-semibold text-gray-400">{fmtCOPFull(monthlyData.prev_totals?.revenue)}</td>
                      <td className="py-2 text-right">
                        {monthlyData.year_delta_pct !== null ? (
                          <span className={`text-sm font-bold ${monthlyData.year_delta_pct > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {monthlyData.year_delta_pct > 0 ? '+' : ''}{monthlyData.year_delta_pct}%
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-right font-semibold text-gray-700">{monthlyData.totals.orders}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Top 10 productos */}
          {topProducts.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Package size={16} className="text-violet-500" />
                Top 10 productos
              </h2>
              <div className="space-y-2">
                {topProducts.map((p, i) => {
                  const maxRev = topProducts[0]?.revenue || 1
                  const pct = (p.revenue / maxRev) * 100
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
                          <div
                            className="h-1.5 rounded-full bg-gradient-to-r from-brand-500 to-emerald-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Comparativa por sucursal */}
          {branchData?.branches?.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Building2 size={16} className="text-blue-500" />
                Comparativa por sucursal
              </h2>
              <div className="space-y-3">
                {branchData.branches.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-xl bg-brand-50 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                      #{b.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-800 truncate">{b.name}</span>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <span className="text-xs text-gray-400">{b.share_pct}% del total</span>
                          <span className="text-sm font-bold text-gray-900">{fmtCOPFull(b.revenue)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${b.share_pct}%`,
                            backgroundColor: PAYMENT_COLORS[i] || '#059669',
                          }}
                        />
                      </div>
                      <div className="flex gap-3 mt-0.5">
                        <span className="text-[10px] text-gray-400">{b.orders} órdenes</span>
                        <span className="text-[10px] text-gray-400">Ticket: {fmtCOP(b.avg_ticket)}</span>
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
