// =============================================================================
// FERZU POS — InventoryInsights
// Archivo: src/components/inventory/InventoryInsights.jsx
// =============================================================================
// Panel de alertas inteligentes de inventario.
// Llama a GET /api/inventory/insights y presenta:
//   - Resumen narrativo generado por IA
//   - Tarjetas de alerta por producto (crítico, bajo, muerto, sobrestock)
//   - Botón "Crear orden de compra" (imprime/copia la lista de reorden)
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, XCircle, TrendingDown, Archive,
  RefreshCw, Loader2, Sparkles, ShoppingCart,
  CheckCircle2, Package, Clock, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api }      from '../../lib/api.js';
import { formatCOP } from '../../lib/math.js';
import toast        from 'react-hot-toast';

// =============================================================================
// CONFIGURACIÓN VISUAL POR TIPO DE ALERTA
// =============================================================================
const INSIGHT_CONFIG = {
  critical_stock: {
    icon:       XCircle,
    color:      'red',
    label:      'Stock Crítico',
    bg:         'bg-red-50',
    border:     'border-red-200',
    iconColor:  'text-red-500',
    badgeBg:    'bg-red-100',
    badgeText:  'text-red-700',
  },
  low_stock: {
    icon:       AlertTriangle,
    color:      'amber',
    label:      'Stock Bajo',
    bg:         'bg-amber-50',
    border:     'border-amber-200',
    iconColor:  'text-amber-500',
    badgeBg:    'bg-amber-100',
    badgeText:  'text-amber-700',
  },
  dead_stock: {
    icon:       Archive,
    color:      'gray',
    label:      'Stock Muerto',
    bg:         'bg-gray-50',
    border:     'border-gray-200',
    iconColor:  'text-gray-400',
    badgeBg:    'bg-gray-100',
    badgeText:  'text-gray-600',
  },
  overstock: {
    icon:       TrendingDown,
    color:      'blue',
    label:      'Sobrestock',
    bg:         'bg-blue-50',
    border:     'border-blue-200',
    iconColor:  'text-blue-400',
    badgeBg:    'bg-blue-100',
    badgeText:  'text-blue-700',
  },
};

// =============================================================================
// InventoryInsights — Componente principal
// =============================================================================
export default function InventoryInsights({ branchId, onInsightCountChange }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [filter,      setFilter]      = useState('all'); // all | critical | warning | info
  const [expanded,    setExpanded]    = useState({}); // { [productId]: bool }
  const [generating,  setGenerating]  = useState(false);

  // ── Cargar insights ────────────────────────────────────────────────────────
  const load = useCallback(async (skipAI = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (branchId)  params.set('branch_id', branchId);
      if (skipAI)    params.set('skip_ai', 'true');

      const { data: res } = await api.get(`/inventory/insights?${params}`);
      setData(res);

      // Notificar al padre el conteo de alertas críticas (para el badge del tab)
      onInsightCountChange?.(res.stats?.criticalCount ?? 0);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [branchId, onInsightCountChange]);

  useEffect(() => { load(); }, [load]);

  // ── Insights filtrados ─────────────────────────────────────────────────────
  const filtered = (data?.insights || []).filter(i => {
    if (filter === 'all')      return true;
    if (filter === 'critical') return i.severity === 'critical';
    if (filter === 'warning')  return i.severity === 'warning';
    if (filter === 'info')     return i.severity === 'info';
    return true;
  });

  // ── Generar orden de compra (solo reabastecer) ─────────────────────────────
  function buildReorderList() {
    const reorderItems = (data?.insights || [])
      .filter(i => i.suggestedReorder > 0)
      .map(i => `${i.productName} (${i.sku || 'sin SKU'}): ${i.suggestedReorder} unid.`)
      .join('\n');

    if (!reorderItems) {
      toast('No hay productos que necesiten reorden por ahora', { icon: '✅' });
      return;
    }

    const text = `ORDEN DE COMPRA SUGERIDA — FERZU POS\nFecha: ${new Date().toLocaleDateString('es-CO')}\n\n${reorderItems}`;
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Lista de reorden copiada al portapapeles');
    }).catch(() => {
      // Fallback: abrir en nueva ventana
      const w = window.open('', '_blank');
      w.document.write(`<pre style="font-family:monospace;font-size:14px">${text}</pre>`);
    });
  }

  // ── Toggle detalle de un producto ─────────────────────────────────────────
  function toggleExpanded(productId) {
    setExpanded(prev => ({ ...prev, [productId]: !prev[productId] }));
  }

  // =============================================================================
  // RENDER: Estado de carga
  // =============================================================================
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-brand-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">Analizando inventario…</p>
          <p className="text-xs text-gray-400 mt-0.5">La IA está procesando tus datos de ventas</p>
        </div>
      </div>
    );
  }

  // =============================================================================
  // RENDER: Error
  // =============================================================================
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
          <XCircle size={22} className="text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">No se pudo cargar el análisis</p>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">{error}</p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-100
                     hover:bg-gray-200 text-gray-700 rounded-xl transition-colors">
          <RefreshCw size={14} />
          Reintentar
        </button>
      </div>
    );
  }

  const { stats, summary, insights } = data || {};
  const hasAlerts = (insights || []).length > 0;

  // =============================================================================
  // RENDER: Principal
  // =============================================================================
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-5 max-w-4xl">

        {/* ── Header con acciones ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Alertas de Inventario IA</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Análisis de los últimos 30 días · {stats?.totalProducts ?? 0} productos
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasAlerts && (
              <button
                onClick={buildReorderList}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold
                           bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200
                           rounded-xl transition-colors">
                <ShoppingCart size={13} />
                Orden de compra
              </button>
            )}
            <button
              onClick={() => load()}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
              title="Actualizar análisis">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* ── Resumen narrativo IA ── */}
        {summary && (
          <div className="bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-200
                          rounded-2xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 bg-brand-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles size={15} className="text-brand-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-brand-700 mb-0.5">Resumen IA</p>
              <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
            </div>
          </div>
        )}

        {/* ── Estadísticas rápidas ── */}
        {hasAlerts && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBadge
              count={stats?.criticalCount}
              label="Críticos"
              color="red"
              onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')}
              active={filter === 'critical'}
            />
            <StatBadge
              count={stats?.warningCount}
              label="Advertencias"
              color="amber"
              onClick={() => setFilter(filter === 'warning' ? 'all' : 'warning')}
              active={filter === 'warning'}
            />
            <StatBadge
              count={stats?.deadStockCount}
              label="Sin movimiento"
              color="gray"
              onClick={() => setFilter(filter === 'warning' ? 'all' : 'warning')}
              active={false}
            />
            <StatBadge
              count={stats?.infoCount}
              label="Sobrestock"
              color="blue"
              onClick={() => setFilter(filter === 'info' ? 'all' : 'info')}
              active={filter === 'info'}
            />
          </div>
        )}

        {/* ── Sin alertas ── */}
        {!hasAlerts && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <CheckCircle2 size={40} className="mx-auto mb-3 text-green-300" />
            <p className="text-sm font-medium text-gray-700">Todo en orden</p>
            <p className="text-xs text-gray-400 mt-1">No hay alertas activas. Tu inventario está equilibrado.</p>
          </div>
        )}

        {/* ── Lista de alertas ── */}
        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map(insight => (
              <InsightCard
                key={insight.productId}
                insight={insight}
                expanded={!!expanded[insight.productId]}
                onToggle={() => toggleExpanded(insight.productId)}
              />
            ))}
          </div>
        )}

        {/* Nota al pie */}
        {hasAlerts && (
          <p className="text-[10px] text-gray-300 text-center">
            Análisis generado con IA · {data?.generatedAt
              ? new Date(data.generatedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
              : '—'}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// InsightCard — Tarjeta individual de alerta
// =============================================================================
function InsightCard({ insight, expanded, onToggle }) {
  const cfg = INSIGHT_CONFIG[insight.type] || INSIGHT_CONFIG.low_stock;
  const Icon = cfg.icon;

  return (
    <div className={`bg-white rounded-2xl border ${cfg.border} overflow-hidden`}>
      {/* ── Cabecera (siempre visible) ── */}
      <div
        className={`flex items-start gap-3 p-4 cursor-pointer hover:${cfg.bg} transition-colors`}
        onClick={onToggle}>

        {/* Icono de tipo */}
        <div className={`w-9 h-9 rounded-xl ${cfg.bg} border ${cfg.border}
                         flex items-center justify-center shrink-0`}>
          <Icon size={16} className={cfg.iconColor} />
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">{insight.productName}</span>
            {insight.sku && (
              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                {insight.sku}
              </span>
            )}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{insight.message}</p>
        </div>

        {/* Indicador de stock actual */}
        <div className="text-right shrink-0 ml-2">
          <p className={`text-lg font-bold ${
            insight.severity === 'critical' ? 'text-red-600'
            : insight.severity === 'warning' ? 'text-amber-600'
            : 'text-gray-600'
          }`}>{insight.currentStock}</p>
          <p className="text-[10px] text-gray-400">en stock</p>
        </div>

        {/* Toggle */}
        <div className="text-gray-300 shrink-0 mt-1">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* ── Detalle expandido ── */}
      {expanded && (
        <div className={`border-t ${cfg.border} ${cfg.bg} px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3`}>
          <DetailItem
            label="Venta diaria"
            value={insight.avgDailySales > 0 ? `${insight.avgDailySales} u/día` : 'Sin ventas'}
          />
          <DetailItem
            label="Días de stock"
            value={insight.daysOfStock !== null ? `~${insight.daysOfStock} días` : '—'}
            highlight={insight.severity === 'critical'}
          />
          {insight.daysSinceLastSale !== null && (
            <DetailItem
              label="Última venta"
              value={`Hace ${insight.daysSinceLastSale} días`}
            />
          )}
          {insight.suggestedReorder && (
            <DetailItem
              label="Reorden sugerido"
              value={`${insight.suggestedReorder} unidades`}
              highlight
            />
          )}
          {insight.stockValue > 0 && (
            <DetailItem
              label="Valor en stock"
              value={formatCOP(insight.stockValue)}
            />
          )}
          {insight.minStock && (
            <DetailItem
              label="Stock mínimo"
              value={`${insight.minStock} u.`}
            />
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// StatBadge — Chip de estadística filtrable
// =============================================================================
function StatBadge({ count, label, color, onClick, active }) {
  if (!count) return null;

  const colors = {
    red:   { bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200',   num: 'text-red-600'   },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', num: 'text-amber-600' },
    gray:  { bg: 'bg-gray-50',  text: 'text-gray-600',  border: 'border-gray-200',  num: 'text-gray-700'  },
    blue:  { bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200',  num: 'text-blue-600'  },
  };
  const c = colors[color] || colors.gray;

  return (
    <button
      onClick={onClick}
      className={`${c.bg} ${c.border} border rounded-xl p-3 text-left transition-all
                  ${active ? 'ring-2 ring-offset-1 ring-brand-400' : 'hover:opacity-80'}`}>
      <p className={`text-2xl font-bold ${c.num}`}>{count}</p>
      <p className={`text-[10px] font-medium mt-0.5 ${c.text}`}>{label}</p>
    </button>
  );
}

// =============================================================================
// DetailItem — Par clave-valor en el detalle expandido
// =============================================================================
function DetailItem({ label, value, highlight = false }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-brand-700' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}
