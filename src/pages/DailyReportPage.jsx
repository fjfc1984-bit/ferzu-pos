// =============================================================================
// FERZU POS — Reporte Diario de Ventas
// Pantalla: /reporte
// Muestra el resumen completo del día: KPIs, ventas por hora, métodos de pago,
// top productos. Permite navegar entre días y enviar el reporte por email.
// =============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Mail, RefreshCw, TrendingUp,
  ShoppingBag, DollarSign, Clock, Tag, Percent, CheckCircle2,
  Loader2, AlertCircle, Calendar, BarChart3, CreditCard,
  Package, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api }         from '../lib/api.js';
import { formatCOP }   from '../lib/math.js';
import { useAuth }     from '../context/AuthContext.jsx';
import { format, parseISO, subDays, addDays, isToday, isTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';

// =============================================================================
// Utilidades
// =============================================================================

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function dateLabel(dateStr) {
  const d = parseISO(dateStr);
  if (isToday(d))              return 'Hoy';
  if (isToday(addDays(d, 1)))  return 'Ayer';
  return format(d, "d 'de' MMMM yyyy", { locale: es });
}

const PAYMENT_COLORS = {
  cash:           { bg: 'bg-emerald-100', text: 'text-emerald-700', bar: '#059669' },
  card_debit:     { bg: 'bg-blue-100',    text: 'text-blue-700',    bar: '#2563eb' },
  card_credit:    { bg: 'bg-violet-100',  text: 'text-violet-700',  bar: '#7c3aed' },
  nequi:          { bg: 'bg-purple-100',  text: 'text-purple-700',  bar: '#9333ea' },
  daviplata:      { bg: 'bg-orange-100',  text: 'text-orange-700',  bar: '#ea580c' },
  transfer:       { bg: 'bg-sky-100',     text: 'text-sky-700',     bar: '#0284c7' },
  mixed:          { bg: 'bg-amber-100',   text: 'text-amber-700',   bar: '#d97706' },
  loyalty_points: { bg: 'bg-pink-100',    text: 'text-pink-700',    bar: '#db2777' },
  other:          { bg: 'bg-gray-100',    text: 'text-gray-600',    bar: '#6b7280' },
};

// =============================================================================
// Hook de datos
// =============================================================================

function useDailyReport(date, branchId) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date });
      if (branchId) params.set('branch_id', branchId);
      const res = await api.get(`/reports/daily?${params}`);
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Error cargando reporte');
    } finally {
      setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

// =============================================================================
// Componentes internos
// =============================================================================

function KPICard({ icon: Icon, label, value, color = 'text-emerald-600', bg = 'bg-emerald-50' }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>
          <Icon size={15} className={color} />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

// Gráfica de barras SVG — ventas por hora
function HourlyChart({ byHour }) {
  if (!byHour || byHour.length === 0) return null;

  const maxRevenue = Math.max(...byHour.map(h => h.revenue), 1);
  const CHART_H = 80;
  const BAR_W   = 14;
  const GAP     = 3;
  const WIDTH   = 24 * (BAR_W + GAP);

  // Hora pico
  const peak = byHour.reduce((a, b) => b.revenue > a.revenue ? b : a);

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Ventas por hora</h3>
          {peak.revenue > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Hora pico: <span className="text-emerald-600 font-semibold">{String(peak.hour).padStart(2,'0')}:00</span>
              {' '}— {formatCOP(peak.revenue)}
            </p>
          )}
        </div>
        <Clock size={16} className="text-gray-400" />
      </div>

      {byHour.every(h => h.revenue === 0) ? (
        <div className="flex items-center justify-center h-24 text-gray-400">
          <p className="text-sm">Sin ventas registradas</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg width={WIDTH} height={CHART_H + 28} className="block mx-auto">
            {byHour.map((h, i) => {
              const barH    = maxRevenue > 0 ? (h.revenue / maxRevenue) * CHART_H : 0;
              const x       = i * (BAR_W + GAP);
              const y       = CHART_H - barH;
              const isPeak  = h.hour === peak.hour && peak.revenue > 0;
              return (
                <g key={h.hour}>
                  <rect
                    x={x} y={y}
                    width={BAR_W} height={Math.max(barH, 0)}
                    rx={3}
                    fill={isPeak ? '#059669' : h.revenue > 0 ? '#6ee7b7' : '#f3f4f6'}
                  />
                  {/* Etiqueta de hora — solo cada 4h */}
                  {h.hour % 4 === 0 && (
                    <text
                      x={x + BAR_W / 2} y={CHART_H + 18}
                      textAnchor="middle"
                      fontSize={9} fill="#9ca3af">
                      {String(h.hour).padStart(2,'0')}h
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

// Desglose por método de pago
function PaymentBreakdown({ byPayment }) {
  if (!byPayment || byPayment.length === 0) return null;
  const total = byPayment.reduce((sum, p) => sum + p.revenue, 0);

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Métodos de pago</h3>
        <CreditCard size={16} className="text-gray-400" />
      </div>

      <div className="space-y-3">
        {byPayment.map(pm => {
          const pct    = total > 0 ? Math.round((pm.revenue / total) * 100) : 0;
          const colors = PAYMENT_COLORS[pm.method] || PAYMENT_COLORS.other;
          return (
            <div key={pm.method}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                    {pm.label}
                  </span>
                  <span className="text-xs text-gray-400">{pm.orders} tickets</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-800">{formatCOP(pm.revenue)}</span>
                  <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: colors.bar }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Top 10 productos
function TopProducts({ products }) {
  if (!products || products.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Top productos</h3>
          <Package size={16} className="text-gray-400" />
        </div>
        <div className="text-center py-6 text-gray-400">
          <Package size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin ventas este día</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Top productos del día</h3>
        <Package size={16} className="text-gray-400" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left">
              <th className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider pb-2 w-6">#</th>
              <th className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider pb-2">Producto</th>
              <th className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider pb-2 text-right w-16">Cant.</th>
              <th className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider pb-2 text-right w-28">Ingresos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products.map((p) => (
              <tr key={p.rank} className="hover:bg-gray-50 transition-colors">
                <td className="py-2.5 pr-2">
                  <span className={`text-xs font-bold ${p.rank === 1 ? 'text-amber-500' : p.rank === 2 ? 'text-gray-400' : p.rank === 3 ? 'text-amber-700' : 'text-gray-300'}`}>
                    {p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank - 1] : p.rank}
                  </span>
                </td>
                <td className="py-2.5 pr-2">
                  <p className="text-sm text-gray-800 font-medium leading-tight truncate max-w-[180px]">{p.name}</p>
                </td>
                <td className="py-2.5 text-right">
                  <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    ×{p.qty}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <span className="text-sm font-bold text-emerald-600">{formatCOP(p.revenue)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Componente principal
// =============================================================================

export default function DailyReportPage() {
  const { branchId } = useAuth();

  // Inicializar la fecha desde URL param si existe
  const params = new URLSearchParams(window.location.search);
  const [date,         setDate]         = useState(params.get('date') || todayStr());
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus,  setEmailStatus]  = useState(null); // 'sent' | 'error' | null

  const { data, loading, error, reload } = useDailyReport(date, branchId);

  // Navegar entre días
  function prevDay() {
    const d = parseISO(date);
    setDate(format(subDays(d, 1), 'yyyy-MM-dd'));
    setEmailStatus(null);
  }

  function nextDay() {
    const d    = parseISO(date);
    const next = addDays(d, 1);
    if (next > new Date()) return; // no mostrar fechas futuras
    setDate(format(next, 'yyyy-MM-dd'));
    setEmailStatus(null);
  }

  const isFuture   = parseISO(date) > new Date();
  const isDateToday = date === todayStr();

  async function handleSendEmail() {
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      await api.post('/reports/daily/send-email', {
        date,
        branch_id: branchId || undefined,
      });
      setEmailStatus('sent');
    } catch (e) {
      setEmailStatus('error');
    } finally {
      setSendingEmail(false);
    }
  }

  // Calcular hora pico
  const peakHour = data?.by_hour?.reduce((a, b) => b.revenue > a.revenue ? b : a, { hour: 0, revenue: 0 });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reporte Diario</h1>
          <p className="text-sm text-gray-500 mt-0.5">Resumen de ventas, productos y métodos de pago</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Email button */}
          <button
            onClick={handleSendEmail}
            disabled={sendingEmail || loading || !data}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
            {sendingEmail
              ? <Loader2 size={14} className="animate-spin" />
              : <Mail size={14} />}
            <span className="hidden sm:inline">Enviar por email</span>
          </button>

          {/* Reload */}
          <button
            onClick={reload}
            disabled={loading}
            className="p-2 text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Feedback de email */}
      {emailStatus === 'sent' && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 size={15} />
          Reporte enviado correctamente al email de la organización.
        </div>
      )}
      {emailStatus === 'error' && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle size={15} />
          Error al enviar el email. Verifica que la organización tenga email configurado.
        </div>
      )}

      {/* ── Selector de fecha ── */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-5 py-3 shadow-sm">
        <button
          onClick={prevDay}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
          <ChevronLeft size={18} />
        </button>

        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <Calendar size={14} className="text-emerald-600" />
            <span className="text-base font-bold text-gray-900">
              {dateLabel(date)}
            </span>
            {isDateToday && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">EN VIVO</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {format(parseISO(date), "EEEE d 'de' MMMM, yyyy", { locale: es })}
          </p>
        </div>

        <button
          onClick={nextDay}
          disabled={isDateToday}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-emerald-600" />
            <p className="text-sm text-gray-500">Cargando reporte…</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-3 px-5 py-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
          <AlertCircle size={18} className="shrink-0" />
          <div>
            <p className="text-sm font-semibold">Error cargando el reporte</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <button onClick={reload} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* ── Sin sucursal seleccionada ── */}
      {!branchId && !loading && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <BarChart3 size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">Selecciona una sucursal para ver el reporte</p>
          <p className="text-xs text-gray-400 mt-1">Usa el selector de sucursal en el menú lateral</p>
        </div>
      )}

      {/* ── Contenido ── */}
      {data && !loading && branchId && (
        <>
          {/* Sin ventas */}
          {data.total_orders === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl px-6 py-8 text-center">
              <ShoppingBag size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-600">Sin ventas registradas</p>
              <p className="text-xs text-gray-400 mt-1">
                {isDateToday
                  ? 'Abre la caja en el POS y registra tu primera venta para ver métricas aquí.'
                  : 'No hubo ventas completadas este día.'}
              </p>
              {isDateToday && (
                <a href="/pos" className="inline-block mt-4 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors">
                  Ir al POS →
                </a>
              )}
            </div>
          )}

          {data.total_orders > 0 && (
            <>
              {/* KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPICard
                  icon={DollarSign}
                  label="Ventas totales"
                  value={formatCOP(data.total_revenue)}
                  color="text-emerald-600"
                  bg="bg-emerald-50"
                />
                <KPICard
                  icon={ShoppingBag}
                  label="Tickets"
                  value={data.total_orders}
                  color="text-blue-600"
                  bg="bg-blue-50"
                />
                <KPICard
                  icon={TrendingUp}
                  label="Ticket promedio"
                  value={formatCOP(data.avg_ticket)}
                  color="text-violet-600"
                  bg="bg-violet-50"
                />
                <KPICard
                  icon={Percent}
                  label="IVA recaudado"
                  value={formatCOP(data.total_tax)}
                  color="text-amber-600"
                  bg="bg-amber-50"
                />
                <KPICard
                  icon={Tag}
                  label="Descuentos"
                  value={formatCOP(data.total_discount)}
                  color="text-red-500"
                  bg="bg-red-50"
                />
                <KPICard
                  icon={Clock}
                  label="Hora pico"
                  value={peakHour?.revenue > 0 ? `${String(peakHour.hour).padStart(2,'0')}:00` : '—'}
                  color="text-sky-600"
                  bg="bg-sky-50"
                />
              </div>

              {/* Gráfica + métodos pago */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <HourlyChart byHour={data.by_hour} />
                </div>
                <div>
                  <PaymentBreakdown byPayment={data.by_payment} />
                </div>
              </div>

              {/* Top productos */}
              <TopProducts products={data.top_products} />
            </>
          )}
        </>
      )}
    </div>
  );
}
