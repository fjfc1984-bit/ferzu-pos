// =============================================================================
// FERZU POS — Dashboard Remoto del Dueño
// Ruta: /owner  (standalone, sin sidebar, mobile-first)
// Muestra resumen ejecutivo de TODAS las sucursales desde cualquier celular.
// Solo accesible para role: owner, admin.
// =============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Package, AlertTriangle, RefreshCw, LogOut,
  ShoppingBag, Store, CreditCard, ChevronRight, Wifi, WifiOff,
  CheckCircle2, XCircle, Clock, DollarSign, Bell
} from 'lucide-react';
import { api }      from '../lib/api.js';
import { useAuth }  from '../context/AuthContext.jsx';
import { formatCOP } from '../lib/math.js';
import { useNavigate } from 'react-router-dom';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(isoDate) {
  if (!isoDate) return '';
  const diff = Math.floor((Date.now() - new Date(isoDate)) / 60000);
  if (diff < 1)  return 'ahora';
  if (diff < 60) return `hace ${diff} min`;
  const h = Math.floor(diff / 60);
  return `hace ${h}h`;
}

const SEVERITY_COLOR = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  low:      'bg-gray-100 text-gray-600 border-gray-200',
};

const SEVERITY_DOT = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-yellow-500',
  low:      'bg-gray-400',
};

// =============================================================================
// COMPONENTES
// =============================================================================

function KPICard({ icon: Icon, label, value, sub, color = 'emerald' }) {
  const colors = {
    emerald: 'from-emerald-500 to-emerald-600',
    blue:    'from-blue-500 to-blue-600',
    purple:  'from-purple-500 to-purple-600',
    orange:  'from-orange-500 to-orange-600',
  };
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className={`inline-flex p-2 rounded-xl bg-gradient-to-br ${colors[color]} mb-3`}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function BranchRow({ branch }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="text-sm font-medium text-gray-800">{branch.name}</span>
        <span className="text-xs text-gray-400">{branch.orders} ventas</span>
      </div>
      <span className="text-sm font-bold text-emerald-600">{formatCOP(branch.revenue)}</span>
    </div>
  );
}

function AlertRow({ alert }) {
  const color = SEVERITY_COLOR[alert.severity] || SEVERITY_COLOR.low;
  const dot   = SEVERITY_DOT[alert.severity]   || SEVERITY_DOT.low;
  return (
    <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${color} mb-2`}>
      <div className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium leading-snug">{alert.description}</p>
        {alert.metadata?.branch_name && (
          <p className="opacity-70 mt-0.5">{alert.metadata.branch_name} · {timeAgo(alert.created_at)}</p>
        )}
      </div>
    </div>
  );
}

function StockRow({ item }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-400">{item.branch}</p>
      </div>
      <div className="text-right ml-3">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
          item.critical
            ? 'bg-red-100 text-red-600'
            : 'bg-orange-100 text-orange-600'
        }`}>
          {item.critical ? 'AGOTADO' : `${item.quantity} uds`}
        </span>
        <p className="text-xs text-gray-400 mt-0.5">mín {item.min_stock}</p>
      </div>
    </div>
  );
}

// =============================================================================
// PÁGINA PRINCIPAL
// =============================================================================

export default function OwnerDashboardPage() {
  const { user, logout }   = useAuth();
  const navigate           = useNavigate();
  const [data, setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]  = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing]   = useState(false);

  // Redirigir si no es owner/admin
  useEffect(() => {
    if (user && !['owner', 'admin'].includes(user.role)) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/owner-summary');
      setData(res.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err?.response?.data?.error || 'Error al cargar datos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh cada 5 minutos
  useEffect(() => {
    const t = setInterval(() => load(true), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  // ── Pantalla de carga ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando resumen...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center">
          <WifiOff size={40} className="text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium mb-1">Sin conexión</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => load()}
            className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const today        = data?.today || {};
  const branches     = data?.branches || [];
  const alerts       = data?.alerts || [];
  const stockAlerts  = data?.stock_alerts || [];
  const cashSessions = data?.cash_sessions || [];
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-4 pt-10 pb-6 safe-top">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-emerald-400 text-xs font-semibold uppercase tracking-widest">FERZU POS</p>
            <h1 className="text-white text-xl font-bold">Resumen del negocio</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Botón refresh */}
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="p-2 rounded-xl bg-white/10 text-white disabled:opacity-40"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            {/* Ir al dashboard completo */}
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <p className="text-gray-400 text-xs mt-1">
          {lastRefresh
            ? `Actualizado ${timeAgo(lastRefresh)}`
            : 'Datos en tiempo real'}
          {' · '}{today.date}
        </p>

        {/* Badge de alertas críticas */}
        {criticalCount > 0 && (
          <div className="mt-3 flex items-center gap-2 bg-red-500/20 border border-red-500/30 rounded-xl px-3 py-2">
            <Bell size={14} className="text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-xs font-medium">
              {criticalCount} alerta{criticalCount > 1 ? 's' : ''} crítica{criticalCount > 1 ? 's' : ''} activa{criticalCount > 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Contenido ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto pb-10">

        {/* KPIs del día */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Hoy</p>
          <div className="grid grid-cols-3 gap-3">
            <KPICard
              icon={DollarSign}
              label="Ventas"
              value={formatCOP(today.revenue || 0)}
              color="emerald"
            />
            <KPICard
              icon={ShoppingBag}
              label="Órdenes"
              value={today.orders || 0}
              color="blue"
            />
            <KPICard
              icon={TrendingUp}
              label="Ticket prom."
              value={formatCOP(today.avg_ticket || 0)}
              color="purple"
            />
          </div>
        </div>

        {/* Sesiones de caja */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={16} className="text-emerald-500" />
            <p className="text-sm font-semibold text-gray-800">Cajas abiertas</p>
            <span className="ml-auto text-xs text-gray-400">{cashSessions.length}</span>
          </div>
          {cashSessions.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Sin cajas abiertas en este momento</p>
          ) : (
            cashSessions.map(s => (
              <div key={s.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{s.branch}</p>
                  <p className="text-xs text-gray-400">Abierta {timeAgo(s.opened_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sucursales */}
        {branches.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Store size={16} className="text-emerald-500" />
              <p className="text-sm font-semibold text-gray-800">Por sucursal</p>
            </div>
            {branches.map(b => <BranchRow key={b.id} branch={b} />)}
          </div>
        )}

        {/* Stock bajo */}
        {stockAlerts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package size={16} className="text-orange-500" />
              <p className="text-sm font-semibold text-gray-800">Stock crítico</p>
              <span className="ml-auto bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {stockAlerts.length}
              </span>
            </div>
            {stockAlerts.map((item, i) => <StockRow key={i} item={item} />)}
          </div>
        )}

        {/* Alertas del sistema */}
        {alerts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-red-500" />
              <p className="text-sm font-semibold text-gray-800">Alertas activas</p>
              <span className="ml-auto bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {alerts.length}
              </span>
            </div>
            {alerts.slice(0, 5).map(a => <AlertRow key={a.id} alert={a} />)}
            {alerts.length > 5 && (
              <button
                onClick={() => navigate('/alertas')}
                className="w-full text-center text-xs text-emerald-600 font-medium py-2"
              >
                Ver {alerts.length - 5} más →
              </button>
            )}
          </div>
        )}

        {/* Estado OK si no hay alertas ni stock crítico */}
        {alerts.length === 0 && stockAlerts.length === 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Todo operando bien</p>
              <p className="text-xs text-emerald-600">Sin alertas ni productos críticos</p>
            </div>
          </div>
        )}

        {/* Botón ir al POS completo */}
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full bg-gray-900 text-white py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
        >
          Abrir dashboard completo
          <ChevronRight size={16} />
        </button>

      </div>
    </div>
  );
}
