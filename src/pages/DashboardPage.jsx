// =============================================================================
// FERZU POS — DASHBOARD Y REPORTES
// Archivo: src/pages/DashboardPage.jsx
// La pantalla del dueño: KPIs del día, gráficas, alertas, reporte IA
// =============================================================================
// SECCIONES:
//   1. DashboardPage.jsx    — Layout principal
//   2. KPICards             — Tarjetas de métricas principales
//   3. SalesChart           — Gráfica de ventas semanal (SVG nativo)
//   4. HeatmapHours         — Mapa de calor por hora del día
//   5. TopProducts          — Top 5 productos del día/semana
//   6. StockAlerts          — Alertas de inventario bajo
//   7. CashSessionSummary   — Estado de la caja actual
//   8. AIReportPanel        — Reporte en lenguaje natural (Claude Haiku)
//   9. useDashboard.js      — Hook de datos con React Query
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, ShoppingBag, Users, DollarSign,
  Package, AlertTriangle, RefreshCw, Zap, ChevronRight,
  BarChart3, Clock, ArrowUpRight, ArrowDownRight, Star,
  CheckCircle2, Wallet, Target, Calendar, Sparkles, Loader2
} from 'lucide-react';
import { supabase }  from '../lib/supabase.js';
import { api }       from '../lib/api.js';
import { useAuth }   from '../context/AuthContext.jsx';
import { formatCOP } from '../lib/math.js';
import { format, subDays, parseISO, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

// =============================================================================
// SECCIÓN 1: DashboardPage — Layout principal
// =============================================================================

// =============================================================================
// TEMPORAL: Modal promocional Facturación Electrónica DIAN
// Para desactivar: eliminar <DIANPromoModal /> del return y este componente
// =============================================================================
function DIANPromoModal() {
  const STORAGE_KEY = 'ferzu_dian_promo_dismissed';
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(STORAGE_KEY); } catch { return false; }
  });

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header verde */}
        <div className="bg-emerald-600 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-emerald-200 text-xs font-medium uppercase tracking-wider">Nuevo servicio opcional</p>
            <h2 className="text-white font-bold text-lg leading-tight">Facturación Electrónica DIAN</h2>
          </div>
          <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">OPCIONAL</span>
        </div>

        {/* Cuerpo */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-gray-600 text-sm">
            Ahora puedes emitir facturas electrónicas directamente desde FERZU POS,
            cumpliendo con la normativa de la DIAN en Colombia.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {[
              ['XML UBL 2.1', 'Formato oficial DIAN'],
              ['Firma digital', 'Con tu certificado .p12'],
              ['PDF + QR DIAN', 'Para entregar al cliente'],
              ['Historial facturas', 'Todo registrado'],
            ].map(([titulo, desc]) => (
              <div key={titulo} className="flex items-start gap-2 bg-emerald-50 rounded-lg p-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-800">{titulo}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
            <p className="text-xs text-gray-500">Add-on disponible desde</p>
            <p className="text-emerald-600 font-bold text-lg">$30.000 – $50.000 COP / mes</p>
            <p className="text-xs text-gray-400">El costo del proveedor tecnológico DIAN lo asume el negocio</p>
          </div>
        </div>

        {/* Botones */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={dismiss}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Ahora no
          </button>
          <a
            href="mailto:fjfc1984@gmail.com?subject=Quiero%20activar%20Facturación%20Electrónica%20DIAN%20en%20FERZU%20POS"
            onClick={dismiss}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold text-center hover:bg-emerald-700 transition-colors"
          >
            Me interesa
          </a>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { organizationId, branchId } = useAuth();
  const [range,    setRange]    = useState('today');   // 'today' | 'week' | 'month'
  const [aiReport, setAiReport] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const { kpis, salesChart, heatmap, topProducts, stockAlerts, cashSession, loading, refresh }
    = useDashboard(branchId, organizationId, range);

  // Auto-refresh cada 5 minutos
  useEffect(() => {
    const id = setInterval(() => { refresh(); setLastRefresh(new Date()); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  async function generateAIReport() {
    if (!kpis) return;
    setAiLoading(true);
    try {
      // Usar la instancia axios (tiene baseURL de Railway configurado, no URL relativa)
      const res = await api.post('/ai/chat', {
        message: `Analiza estos datos de negocio y dame un resumen ejecutivo en español colombiano, máximo 3 párrafos. Datos: Ventas=${formatCOP(kpis.totalSales)}, Tickets=${kpis.totalOrders}, Ticket promedio=${formatCOP(kpis.avgTicket)}, Clientes nuevos=${kpis.newCustomers}, Margen estimado=${kpis.marginPct}%, Top producto="${topProducts?.[0]?.name || 'N/A'}". Incluye 1 recomendación concreta.`,
        model: 'claude-haiku-4-5-20251001',
      });
      setAiReport(res.data?.response || res.data?.message || '');
    } catch {
      setAiReport('Error al conectar con el asistente IA. Verifica la clave de API.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* ── TEMPORAL: Modal DIAN — eliminar cuando ya no se necesite ── */}
      <DIANPromoModal />

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 size={20} className="text-brand-600" />
            Dashboard
          </h1>
          <p className="text-xs text-gray-400">
            Actualizado {format(lastRefresh, 'h:mm a')} ·{' '}
            {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de rango */}
          <div className="flex bg-gray-100 rounded-xl overflow-hidden">
            {[['today','Hoy'],['week','Semana'],['month','Mes']].map(([val, label]) => (
              <button key={val} onClick={() => setRange(val)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === val ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <button onClick={() => { refresh(); setLastRefresh(new Date()); }}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Contenido scrolleable ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* KPI Cards */}
        <KPICards kpis={kpis} loading={loading} />

        {/* Fila 2: Gráfica + Mapa de calor */}
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2">
            <SalesChart data={salesChart} range={range} loading={loading} />
          </div>
          <div>
            <HeatmapHours data={heatmap} loading={loading} />
          </div>
        </div>

        {/* Fila 3: Top productos + Alertas stock + Caja */}
        <div className="grid grid-cols-3 gap-5">
          <TopProducts products={topProducts} loading={loading} />
          <StockAlerts  alerts={stockAlerts} loading={loading} />
          <CashSessionSummary session={cashSession} loading={loading} />
        </div>

        {/* Reporte IA */}
        <AIReportPanel
          report={aiReport}
          loading={aiLoading}
          onGenerate={generateAIReport}
        />
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 2: KPICards — 5 métricas principales
// =============================================================================

function KPICards({ kpis, loading }) {
  const cards = [
    {
      label:  'Ventas totales',
      value:  kpis ? formatCOP(kpis.totalSales) : '—',
      prev:   kpis?.salesVsPrev,
      icon:   DollarSign,
      color:  'text-brand-600',
      bg:     'bg-brand-50',
    },
    {
      label:  'Tickets',
      value:  kpis?.totalOrders ?? '—',
      prev:   kpis?.ordersVsPrev,
      icon:   ShoppingBag,
      color:  'text-blue-600',
      bg:     'bg-blue-50',
    },
    {
      label:  'Ticket promedio',
      value:  kpis ? formatCOP(kpis.avgTicket) : '—',
      prev:   kpis?.avgTicketVsPrev,
      icon:   Target,
      color:  'text-purple-600',
      bg:     'bg-purple-50',
    },
    {
      label:  'Clientes nuevos',
      value:  kpis?.newCustomers ?? '—',
      prev:   null,
      icon:   Users,
      color:  'text-amber-600',
      bg:     'bg-amber-50',
    },
    {
      label:  'Margen estimado',
      value:  kpis ? `${kpis.marginPct}%` : '—',
      prev:   null,
      icon:   TrendingUp,
      color:  'text-green-600',
      bg:     'bg-green-50',
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-4">
      {cards.map(({ label, value, prev, icon: Icon, color, bg }) => (
        <div key={label} className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 font-medium">{label}</p>
            <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon size={15} className={color} />
            </div>
          </div>

          {loading ? (
            <div className="h-7 w-24 bg-gray-100 rounded-lg animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-gray-900">{value}</p>
          )}

          {prev !== null && prev !== undefined && (
            <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${
              prev >= 0 ? 'text-green-600' : 'text-red-500'
            }`}>
              {prev >= 0
                ? <ArrowUpRight size={12} />
                : <ArrowDownRight size={12} />}
              {Math.abs(prev)}% vs ayer
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// =============================================================================
// SECCIÓN 3: SalesChart — Gráfica de barras SVG nativa (sin dependencias)
// =============================================================================

function SalesChart({ data, range, loading }) {
  const W = 480, H = 160, PAD = { top: 10, right: 10, bottom: 30, left: 50 };

  const maxVal = data?.length ? Math.max(...data.map(d => d.total), 1) : 1;

  function barX(i) { return PAD.left + i * ((W - PAD.left - PAD.right) / (data?.length || 1)); }
  function barW()   { return ((W - PAD.left - PAD.right) / (data?.length || 1)) * 0.65; }
  function barH(v)  { return ((H - PAD.top - PAD.bottom) * v) / maxVal; }
  function barY(v)  { return H - PAD.bottom - barH(v); }

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Ventas por {range === 'today' ? 'hora' : 'día'}</h3>
        <span className="text-xs text-gray-400">
          {range === 'today' ? 'Hoy' : range === 'week' ? 'Últimos 7 días' : 'Este mes'}
        </span>
      </div>

      {loading || !data?.length ? (
        <div className="h-40 flex items-center justify-center">
          {loading
            ? <Loader2 size={20} className="animate-spin text-gray-300" />
            : <p className="text-xs text-gray-400">Sin datos para este período</p>}
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
          {/* Líneas horizontales de referencia */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = PAD.top + (H - PAD.top - PAD.bottom) * (1 - pct);
            return (
              <g key={pct}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  stroke="#f3f4f6" strokeWidth={1} />
                <text x={PAD.left - 6} y={y + 3} textAnchor="end"
                  className="text-[9px]" fill="#9ca3af" fontSize={9}>
                  {formatCOPShort(maxVal * pct)}
                </text>
              </g>
            );
          })}

          {/* Barras */}
          {data.map((d, i) => {
            const x  = barX(i);
            const bw = barW();
            const bh = barH(d.total);
            const by = barY(d.total);
            return (
              <g key={i}>
                {/* Sombra */}
                <rect x={x + 1} y={by + 2} width={bw} height={bh}
                  rx={4} fill="#e5e7eb" />
                {/* Barra principal */}
                <rect x={x} y={by} width={bw} height={bh}
                  rx={4} fill={d.total > 0 ? '#0F6E56' : '#e5e7eb'} />
                {/* Etiqueta eje X */}
                <text x={x + bw / 2} y={H - PAD.bottom + 12}
                  textAnchor="middle" fill="#9ca3af" fontSize={8}>
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function formatCOPShort(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}


// =============================================================================
// SECCIÓN 4: HeatmapHours — Mapa de calor por hora
// =============================================================================

function HeatmapHours({ data, loading }) {
  // data: { hour: 8, count: 12, total: 450000 }[]
  const maxCount = data?.length ? Math.max(...data.map(d => d.count), 1) : 1;

  function intensity(count) { return count / maxCount; }
  function heatColor(pct) {
    // Escala brand-50 → brand-600
    const r = Math.round(14  + (15  - 14)  * (1 - pct));
    const g = Math.round(110 + (110 - 110) * (1 - pct));
    const b = Math.round(86  + (86  - 86)  * (1 - pct));
    const alpha = 0.1 + pct * 0.9;
    return `rgba(15, 110, 86, ${alpha})`;
  }

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm h-full">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Horas pico</h3>

      {loading || !data?.length ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-xs text-gray-400">Sin datos</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 14 }, (_, i) => i + 7).map(h => {
            const d = data.find(x => x.hour === h);
            const pct = d ? intensity(d.count) : 0;
            return (
              <div key={h} title={`${h}:00 — ${d?.count || 0} ventas`}
                className="relative rounded-lg aspect-square flex items-center justify-center text-[9px] font-medium cursor-default transition-transform hover:scale-110"
                style={{ backgroundColor: pct > 0 ? heatColor(pct) : '#f9fafb', color: pct > 0.5 ? '#fff' : '#9ca3af' }}>
                {h}h
              </div>
            );
          })}
        </div>
      )}

      {data?.length > 0 && (
        <div className="mt-3 pt-2 border-t border-gray-100">
          {(() => {
            const peak = data.reduce((best, d) => d.count > (best?.count || 0) ? d : best, null);
            return peak ? (
              <p className="text-[11px] text-gray-500">
                🔥 Hora pico: <strong className="text-gray-700">{peak.hour}:00</strong>
                {' '}({peak.count} ventas)
              </p>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 5: TopProducts — Top 5 productos del período
// =============================================================================

function TopProducts({ products, loading }) {
  const maxQty = products?.length ? Math.max(...products.map(p => p.quantity), 1) : 1;

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Star size={14} className="text-amber-500" />
        Top productos
      </h3>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : products?.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">Sin ventas en este período</p>
      ) : products?.map((p, i) => (
        <div key={p.product_id} className="flex items-center gap-3 mb-3 last:mb-0">
          <div className="w-5 text-center text-xs font-bold text-gray-400">{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
              <p className="text-xs text-gray-500 shrink-0 ml-2">{p.quantity} uds</p>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-1.5 bg-brand-500 rounded-full transition-all"
                style={{ width: `${(p.quantity / maxQty) * 100}%` }} />
            </div>
          </div>
          <span className="text-xs font-semibold text-gray-700 shrink-0">{formatCOP(p.total)}</span>
        </div>
      ))}
    </div>
  );
}


// =============================================================================
// SECCIÓN 6: StockAlerts — Productos con inventario bajo
// =============================================================================

function StockAlerts({ alerts, loading }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-500" />
        Alertas de stock
        {alerts?.length > 0 && (
          <span className="ml-auto bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {alerts.length}
          </span>
        )}
      </h3>

      {loading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : alerts?.length === 0 ? (
        <div className="text-center py-5">
          <CheckCircle2 size={24} className="text-green-400 mx-auto mb-1" />
          <p className="text-xs text-gray-400">Inventario en orden</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.product_id}
              className={`flex items-center gap-2 rounded-xl p-2.5 border ${
                a.quantity === 0
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
              <Package size={13} className={a.quantity === 0 ? 'text-red-500' : 'text-amber-500'} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{a.name}</p>
                <p className={`text-[10px] ${a.quantity === 0 ? 'text-red-600' : 'text-amber-700'}`}>
                  {a.quantity === 0 ? 'SIN STOCK' : `${a.quantity} uds (mín: ${a.min_stock})`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 7: CashSessionSummary — Estado de la caja actual
// =============================================================================

function CashSessionSummary({ session, loading }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Wallet size={14} className="text-brand-600" />
        Caja actual
      </h3>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : !session ? (
        <div className="text-center py-5">
          <Clock size={22} className="text-gray-300 mx-auto mb-1" />
          <p className="text-xs text-gray-400">No hay caja abierta</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[
            { label: 'Apertura',        value: formatCOP(session.opening_cash),          color: 'text-gray-700' },
            { label: 'Ventas efectivo', value: formatCOP(session.cash_sales),             color: 'text-gray-700' },
            { label: 'Ventas digital',  value: formatCOP(session.digital_sales),          color: 'text-gray-700' },
            { label: 'Total esperado',  value: formatCOP(session.expected_cash),          color: 'text-brand-700 font-semibold' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{label}</span>
              <span className={color}>{value}</span>
            </div>
          ))}

          <div className="pt-2 mt-1 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">
              Abierta {session.opened_at ? format(parseISO(session.opened_at), 'h:mm a') : '—'} ·{' '}
              {session.orders_count || 0} transacciones
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 8: AIReportPanel — Reporte en lenguaje natural con Claude Haiku
// =============================================================================

function AIReportPanel({ report, loading, onGenerate }) {
  return (
    <div className="bg-gradient-to-br from-brand-900 to-brand-700 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles size={15} className="text-brand-200" />
          Análisis IA del día
        </h3>
        <button
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          {loading ? 'Analizando...' : 'Generar análisis'}
        </button>
      </div>

      {report ? (
        <p className="text-sm text-brand-100 leading-relaxed whitespace-pre-line">{report}</p>
      ) : (
        <p className="text-brand-300 text-xs">
          Haz clic en "Generar análisis" para que el asistente IA revise las métricas del día y te dé recomendaciones en lenguaje natural.
        </p>
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 9: useDashboard — Hook de datos
// =============================================================================

function dateRange(range) {
  const now  = new Date();
  const from = range === 'today' ? startOfDay(now)
             : range === 'week'  ? startOfDay(subDays(now, 6))
             : startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = endOfDay(now);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function useDashboard(branchId, organizationId, range) {
  const [kpis,         setKpis]         = useState(null);
  const [salesChart,   setSalesChart]   = useState([]);
  const [heatmap,      setHeatmap]      = useState([]);
  const [topProducts,  setTopProducts]  = useState([]);
  const [stockAlerts,  setStockAlerts]  = useState([]);
  const [cashSession,  setCashSession]  = useState(null);
  const [loading,      setLoading]      = useState(true);

  async function refresh() {
    if (!branchId) return;
    setLoading(true);
    const { from, to } = dateRange(range);

    try {
      await Promise.all([
        loadKPIs(from, to),
        loadSalesChart(from, to),
        loadHeatmap(from, to),
        loadTopProducts(from, to),
        loadStockAlerts(),
        loadCashSession(),
      ]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [branchId, range]);

  async function loadKPIs(from, to) {
    const { data: orders } = await supabase
      .from('orders')
      .select('total, cost_total, customer_id, created_at')
      .eq('branch_id', branchId)
      .eq('status', 'paid')
      .gte('created_at', from)
      .lte('created_at', to);

    if (!orders) return;

    // Período anterior para comparar (mismo rango hacia atrás)
    const rangeMs = new Date(to) - new Date(from);
    const prevFrom = new Date(new Date(from) - rangeMs).toISOString();
    const prevTo   = from;

    const { data: prevOrders } = await supabase
      .from('orders')
      .select('total')
      .eq('branch_id', branchId)
      .eq('status', 'paid')
      .gte('created_at', prevFrom)
      .lte('created_at', prevTo);

    // BACKEND calcula totales (nunca el cliente para reportes críticos)
    // Aquí es OK para visualización — el backend recalcula para DIAN
    const totalSales  = orders.reduce((s, o) => s + o.total, 0);
    const totalCost   = orders.reduce((s, o) => s + (o.cost_total || 0), 0);
    const totalOrders = orders.length;
    const avgTicket   = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;
    const marginPct   = totalSales > 0 ? Math.round(((totalSales - totalCost) / totalSales) * 100) : 0;

    const prevSales  = (prevOrders || []).reduce((s, o) => s + o.total, 0);
    const prevCount  = prevOrders?.length || 0;

    const newCustIds = new Set(orders.filter(o => o.customer_id).map(o => o.customer_id));

    setKpis({
      totalSales,
      totalOrders,
      avgTicket,
      marginPct,
      newCustomers: newCustIds.size,
      salesVsPrev:  prevSales > 0 ? Math.round(((totalSales - prevSales) / prevSales) * 100) : 0,
      ordersVsPrev: prevCount > 0 ? Math.round(((totalOrders - prevCount) / prevCount) * 100) : 0,
      avgTicketVsPrev: prevCount > 0 ? Math.round(((avgTicket - (prevSales / prevCount)) / (prevSales / prevCount)) * 100) : 0,
    });
  }

  async function loadSalesChart(from, to) {
    const { data } = await supabase.rpc('get_sales_chart', {
      p_branch_id: branchId,
      p_from: from,
      p_to: to,
      p_range: range,
    }).catch(() => ({ data: null }));

    // Fallback manual si la RPC no existe aún
    if (!data) {
      const { data: orders } = await supabase
        .from('orders')
        .select('total, created_at')
        .eq('branch_id', branchId)
        .eq('status', 'paid')
        .gte('created_at', from)
        .lte('created_at', to);

      const grouped = {};
      for (const o of orders || []) {
        const key = range === 'today'
          ? format(parseISO(o.created_at), 'HH')
          : format(parseISO(o.created_at), 'EEE', { locale: es });
        grouped[key] = (grouped[key] || 0) + o.total;
      }
      setSalesChart(Object.entries(grouped).map(([label, total]) => ({ label, total })));
      return;
    }
    setSalesChart(data);
  }

  async function loadHeatmap(from, to) {
    const { data: orders } = await supabase
      .from('orders')
      .select('created_at, total')
      .eq('branch_id', branchId)
      .eq('status', 'paid')
      .gte('created_at', from)
      .lte('created_at', to);

    const byHour = {};
    for (const o of orders || []) {
      const h = new Date(o.created_at).getHours();
      if (!byHour[h]) byHour[h] = { hour: h, count: 0, total: 0 };
      byHour[h].count++;
      byHour[h].total += o.total;
    }
    setHeatmap(Object.values(byHour));
  }

  async function loadTopProducts(from, to) {
    const { data } = await supabase
      .from('order_items')
      .select('product_id, product_name, quantity, subtotal, orders!inner(branch_id, status, created_at)')
      .eq('orders.branch_id', branchId)
      .eq('orders.status', 'paid')
      .gte('orders.created_at', from)
      .lte('orders.created_at', to);

    // Agrupar por producto
    const map = {};
    for (const item of data || []) {
      if (!map[item.product_id]) {
        map[item.product_id] = { product_id: item.product_id, name: item.product_name, quantity: 0, total: 0 };
      }
      map[item.product_id].quantity += item.quantity;
      map[item.product_id].total    += item.subtotal;
    }

    setTopProducts(
      Object.values(map)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
    );
  }

  async function loadStockAlerts() {
    // Usar la vista v_inventory_status (columna-a-columna via SQL en DB, no en JS)
    // supabase.raw() NO existe en supabase-js v2 — se eliminó la query rota
    const { data: alerts } = await supabase
      .from('v_inventory_status')
      .select('product_id, name, quantity, min_stock, status')
      .eq('branch_id', branchId)
      .in('status', ['low_stock', 'out_of_stock'])
      .order('quantity');

    // Fallback: si la vista no existe aún, comparar client-side
    if (!alerts) {
      const { data: raw } = await supabase
        .from('inventory')
        .select('product_id, quantity, min_stock, products(name)')
        .eq('branch_id', branchId);
      const lowStock = (raw || []).filter(r => r.quantity <= r.min_stock);
      setStockAlerts(lowStock.map(d => ({
        product_id: d.product_id,
        name:       d.products?.name || '—',
        quantity:   d.quantity,
        min_stock:  d.min_stock,
        status:     d.quantity === 0 ? 'out_of_stock' : 'low_stock',
      })));
      return;
    }

    setStockAlerts(alerts || []);
  }

  async function loadCashSession() {
    const { data } = await supabase
      .from('cash_sessions')
      .select(`
        id, opening_cash, status, opened_at,
        orders!inner(total, order_type, payments(payment_method, amount))
      `)
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) { setCashSession(null); return; }

    // Calcular totales de la sesión (display only — el backend recalcula para cierre oficial)
    let cashSales = 0, digitalSales = 0, orderCount = 0;
    for (const order of data.orders || []) {
      orderCount++;
      for (const payment of order.payments || []) {
        if (payment.payment_method === 'cash') cashSales    += payment.amount;
        else                                    digitalSales += payment.amount;
      }
    }

    setCashSession({
      id:            data.id,
      opening_cash:  data.opening_cash,
      opened_at:     data.opened_at,
      cash_sales:    cashSales,
      digital_sales: digitalSales,
      expected_cash: data.opening_cash + cashSales,
      orders_count:  orderCount,
    });
  }

  return { kpis, salesChart, heatmap, topProducts, stockAlerts, cashSession, loading, refresh };
}
