// =============================================================================
// FERZU POS — DASHBOARD DIAN (Facturación Electrónica)
// Archivo: src/pages/DianPage.jsx
// =============================================================================
// SECCIONES:
//   1. DianPage              — Layout principal con tabs
//   2. ResolutionStatus      — Estado de la resolución DIAN activa
//   3. InvoiceMetrics        — Métricas del día y semana
//   4. ContingencyQueue      — Facturas en contingencia + reintento
//   5. NITValidator          — Herramienta de validación NIT en tiempo real
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, AlertTriangle, CheckCircle2, RefreshCw, Loader2,
  Hash, Clock, TrendingUp, XCircle, ShieldCheck, Zap,
  RotateCcw, ChevronRight, Info, Calendar, BarChart3,
  Search, CheckCircle, AlertCircle, Settings2, List,
  Download, Mail, Eye, DollarSign
} from 'lucide-react';
import { api }      from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import { useAuth }  from '../context/AuthContext.jsx';
import { format, parseISO, startOfDay, endOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useTrack } from '../hooks/useTrack.js';

// =============================================================================
// SECCIÓN 1: DianPage — Layout principal
// =============================================================================

export default function DianPage() {
  const [tab, setTab] = useState('overview');
  const { organizationId } = useAuth();
  const navigate = useNavigate();
  const track = useTrack();
  useEffect(() => { track('module_view', 'dian') }, [track]);

  const TABS = [
    { key: 'overview',     label: 'Resumen',      icon: BarChart3    },
    { key: 'invoices',     label: 'Facturas',     icon: List         },
    { key: 'contingency',  label: 'Contingencias', icon: AlertTriangle },
    { key: 'nit',          label: 'Validar NIT',  icon: ShieldCheck  },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 pt-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText size={20} className="text-brand-600" />
            DIAN — Facturación Electrónica
          </h1>
          <span className="text-xs px-2.5 py-1 bg-amber-100 text-amber-700 font-medium rounded-full border border-amber-200">
            Ambiente habilitación (DIAN Test)
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-brand-500 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} />
              {label}
            </button>
          ))}
          </div>
          <button
            onClick={() => navigate('/dian/setup')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                       text-brand-700 border border-brand-200 hover:bg-brand-50 rounded-xl
                       transition-colors mb-1">
            <Settings2 size={13} />
            Configurar
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview'    && <OverviewTab     organizationId={organizationId} />}
        {tab === 'invoices'    && <InvoicesTab    organizationId={organizationId} />}
        {tab === 'contingency' && <ContingencyTab  organizationId={organizationId} />}
        {tab === 'nit'         && <NITValidatorTab />}
      </div>
    </div>
  );
}

// =============================================================================
// SECCIÓN NUEVA: InvoicesTab — Lista de facturas electrónicas del día
// =============================================================================

const STATUS_CONFIG = {
  accepted:    { label: 'Aceptada',     bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  pending:     { label: 'Pendiente',    bg: 'bg-gray-100',    text: 'text-gray-600',    dot: 'bg-gray-400'    },
  sending:     { label: 'Enviando',     bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  rejected:    { label: 'Rechazada',    bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
  contingency: { label: 'Contingencia', bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
};

function InvoicesTab({ organizationId }) {
  const [invoices,    setInvoices]    = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [statusFilter,setStatusFilter]= useState('all');
  const [date,        setDate]        = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expanded,    setExpanded]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date, limit: 100 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/dian/invoices', { params });
      setInvoices(data.invoices || []);
      setStats(data.stats || null);
    } catch {
      toast.error('Error cargando facturas');
    } finally {
      setLoading(false);
    }
  }, [date, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const fmtCOP = (n) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[['all','Todas'],['accepted','Aceptadas'],['pending','Pendientes'],['rejected','Rechazadas'],['contingency','Contingencia']].map(([v,l]) => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  statusFilter === v
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                }`}>{l}</button>
            ))}
          </div>
          <button onClick={load}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>
      </div>

      {/* Stats del día */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total facturas', value: stats.total,       icon: FileText,    color: 'text-brand-600' },
            { label: 'Aceptadas',      value: stats.accepted,    icon: CheckCircle, color: 'text-emerald-600' },
            { label: 'Con problemas',  value: stats.rejected + stats.contingency, icon: AlertCircle, color: 'text-red-500' },
            { label: 'Valor total',    value: fmtCOP(stats.totalAmount), icon: DollarSign, color: 'text-gray-700', isText: true },
          ].map(({ label, value, icon: Icon, color, isText }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center`}>
                <Icon size={15} className={color} />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{isText ? value : value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-brand-500" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <FileText size={32} className="opacity-40" />
            <p className="text-sm">No hay facturas para este día</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invoices.map(inv => {
              const cfg = STATUS_CONFIG[inv.dian_status] || STATUS_CONFIG.pending;
              const isOpen = expanded === inv.id;
              return (
                <div key={inv.id} className="hover:bg-gray-50 transition-colors">
                  <button
                    onClick={() => setExpanded(isOpen ? null : inv.id)}
                    className="w-full px-5 py-3.5 flex items-center gap-3 text-left">
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    {/* Número */}
                    <span className="font-mono text-sm font-semibold text-gray-800 w-36 shrink-0 truncate">
                      {inv.invoice_number || '—'}
                    </span>
                    {/* Cliente */}
                    <span className="text-sm text-gray-600 flex-1 truncate">
                      {inv.customer_name || 'Consumidor final'}
                    </span>
                    {/* Total */}
                    <span className="text-sm font-medium text-gray-800 w-28 text-right shrink-0">
                      {fmtCOP(inv.total)}
                    </span>
                    {/* Estado */}
                    <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text} w-28 text-center shrink-0`}>
                      {cfg.label}
                    </span>
                    {/* Hora */}
                    <span className="text-xs text-gray-400 w-20 text-right shrink-0">
                      {inv.issued_at ? format(parseISO(inv.issued_at), 'HH:mm', { locale: es }) : '—'}
                    </span>
                    <ChevronRight size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>

                  {/* Detalle expandible */}
                  {isOpen && (
                    <div className="px-6 pb-4 pt-0 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2 text-xs py-3">
                        <div>
                          <p className="text-gray-400 uppercase tracking-wide mb-0.5">CUFE</p>
                          <p className="font-mono text-gray-600 truncate text-[11px]">{inv.cufe || '—'}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 uppercase tracking-wide mb-0.5">NIT / Doc comprador</p>
                          <p className="font-medium text-gray-700">{inv.customer_nit || '222.222.222'}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 uppercase tracking-wide mb-0.5">Subtotal / IVA</p>
                          <p className="font-medium text-gray-700">{fmtCOP(inv.subtotal)} / {fmtCOP(inv.tax_total)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 uppercase tracking-wide mb-0.5">Aceptada</p>
                          <p className="font-medium text-gray-700">
                            {inv.accepted_at ? format(parseISO(inv.accepted_at), 'dd/MM/yyyy HH:mm') : '—'}
                          </p>
                        </div>
                        {inv.customer_email && (
                          <div>
                            <p className="text-gray-400 uppercase tracking-wide mb-0.5">Email</p>
                            <p className="font-medium text-gray-700 truncate">{inv.customer_email}</p>
                          </div>
                        )}
                      </div>
                      {/* Acciones */}
                      <div className="flex items-center gap-2 mt-2">
                        {inv.pdf_url && (
                          <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-700 border border-brand-200 rounded-xl hover:bg-brand-50 transition-colors">
                            <Download size={12} /> Descargar PDF
                          </a>
                        )}
                        {inv.customer_email && inv.dian_status === 'accepted' && (
                          <button
                            onClick={async () => {
                              try {
                                await api.post(`/dian/resend-email/${inv.id}`);
                                toast.success('Email reenviado');
                              } catch {
                                toast.error('Error reenviando email');
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                            <Mail size={12} /> Reenviar email
                          </button>
                        )}
                        <span className="text-[10px] text-gray-400 ml-auto font-mono">
                          Orden: {inv.order_id?.slice(0, 8)}…
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SECCIÓN 2: OverviewTab — Resolución + Métricas
// =============================================================================

function OverviewTab({ organizationId }) {
  return (
    <div className="space-y-6 max-w-4xl">
      <ResolutionStatus organizationId={organizationId} />
      <InvoiceMetrics   organizationId={organizationId} />
    </div>
  );
}

// =============================================================================
// SECCIÓN 2a: ResolutionStatus — Estado de la resolución DIAN activa
// =============================================================================

function ResolutionStatus({ organizationId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await api.get('/dian/resolution-status');
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Estado de carga ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-3">
        <Loader2 size={18} className="animate-spin text-gray-300" />
        <span className="text-sm text-gray-400">Consultando resolución DIAN…</span>
      </div>
    );
  }

  // ─── Error de red / backend ──────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-red-600">
          <XCircle size={16} />
          <span>No se pudo consultar la resolución: <span className="font-mono text-xs opacity-70">{error}</span></span>
        </div>
        <button onClick={load} className="text-xs text-red-400 hover:text-red-600 underline">Reintentar</button>
      </div>
    );
  }

  // ─── Sin configuración ───────────────────────────────────────────────────
  if (!data?.configured) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-amber-300 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm mb-1">Sin resolución DIAN configurada</h3>
            <p className="text-xs text-gray-500">
              Para emitir facturas electrónicas debes configurar tu resolución DIAN, certificado digital
              y proveedor tecnológico (PTA). Contacta soporte para activar este módulo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Con resolución ──────────────────────────────────────────────────────
  const { resolution } = data;
  const daysLeft      = resolution?.daysLeft    ?? 0;
  const numbersUsed   = resolution?.numbersUsed ?? 0;
  const numbersLeft   = resolution?.numbersLeft ?? 0;
  const rangeFrom     = resolution?.from        ?? '—';
  const rangeTo       = resolution?.to          ?? '—';
  const expiresAt     = resolution?.expiresAt   ?? null;
  const isExpiringSoon = daysLeft <= 30 && daysLeft > 0;
  const isExpired      = daysLeft <= 0;
  const numbersPercent = (numbersUsed + numbersLeft) > 0
    ? Math.round((numbersUsed / (numbersUsed + numbersLeft)) * 100)
    : 0;

  const statusColor = isExpired       ? 'border-red-300 bg-red-50'
                    : isExpiringSoon   ? 'border-amber-300 bg-amber-50'
                    : 'border-green-300 bg-green-50';
  const statusIcon  = isExpired       ? <XCircle size={18} className="text-red-500" />
                    : isExpiringSoon   ? <AlertTriangle size={18} className="text-amber-500" />
                    : <CheckCircle2 size={18} className="text-green-500" />;

  return (
    <div className={`bg-white rounded-2xl border p-5 ${statusColor}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {statusIcon}
          <h3 className="font-semibold text-gray-900 text-sm">Resolución DIAN activa</h3>
          {resolution?.number && (
            <span className="text-xs text-gray-500 font-mono bg-white px-2 py-0.5 rounded-lg border border-gray-200">
              Nº {resolution.number}
            </span>
          )}
        </div>
        <button onClick={load} className="text-gray-400 hover:text-gray-600">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Días restantes */}
        <div className="bg-white rounded-xl p-3 border border-white/80">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar size={12} className="text-gray-400" />
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Vence</span>
          </div>
          <p className={`text-2xl font-bold ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-600' : 'text-gray-900'}`}>
            {isExpired ? 'Vencida' : `${daysLeft}d`}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {expiresAt ? format(parseISO(expiresAt), "d 'de' MMM yyyy", { locale: es }) : '—'}
          </p>
        </div>

        {/* Números usados */}
        <div className="bg-white rounded-xl p-3 border border-white/80">
          <div className="flex items-center gap-1.5 mb-1">
            <Hash size={12} className="text-gray-400" />
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Usados</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{numbersUsed.toLocaleString('es-CO')}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Rango: {rangeFrom}–{rangeTo}</p>
        </div>

        {/* Números disponibles */}
        <div className="bg-white rounded-xl p-3 border border-white/80">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-gray-400" />
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Disponibles</span>
          </div>
          <p className={`text-2xl font-bold ${numbersLeft < 50 ? 'text-amber-600' : 'text-green-700'}`}>
            {numbersLeft.toLocaleString('es-CO')}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">facturas restantes</p>
        </div>

        {/* Barra de uso */}
        <div className="bg-white rounded-xl p-3 border border-white/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Uso</span>
            <span className="text-xs font-bold text-gray-700">{numbersPercent}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                numbersPercent > 90 ? 'bg-red-500' : numbersPercent > 70 ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(numbersPercent, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">del rango autorizado</p>
        </div>
      </div>

      {/* Alertas */}
      {(isExpired || isExpiringSoon || numbersLeft < 50) && (
        <div className={`mt-3 flex items-center gap-2 text-xs rounded-xl px-3 py-2 ${
          isExpired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
        }`}>
          <Info size={12} />
          {isExpired
            ? 'La resolución está vencida. Solicita una nueva resolución a la DIAN para continuar facturando.'
            : isExpiringSoon && numbersLeft < 50
            ? `Atención: solo quedan ${numbersLeft} números y la resolución vence en ${daysLeft} días.`
            : isExpiringSoon
            ? `La resolución vence en ${daysLeft} días. Solicita renovación a la DIAN.`
            : `Solo quedan ${numbersLeft} números disponibles en esta resolución.`
          }
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SECCIÓN 2b: InvoiceMetrics — Métricas de facturación del día y semana
// =============================================================================

function InvoiceMetrics({ organizationId }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const today = new Date();
        const weekAgo = subDays(today, 7);

        // Facturas del día
        const { data: todayData } = await supabase
          .from('electronic_invoices')
          .select('id, dian_status, issued_at')
          .eq('organization_id', organizationId)
          .gte('issued_at', startOfDay(today).toISOString())
          .lte('issued_at', endOfDay(today).toISOString());

        // Facturas de la semana
        const { data: weekData } = await supabase
          .from('electronic_invoices')
          .select('id, dian_status, issued_at')
          .eq('organization_id', organizationId)
          .gte('issued_at', weekAgo.toISOString());

        const todayInvoices = todayData || [];
        const weekInvoices  = weekData  || [];

        setMetrics({
          today: {
            total:       todayInvoices.length,
            approved:    todayInvoices.filter(i => i.dian_status === 'approved').length,
            contingency: todayInvoices.filter(i => i.dian_status === 'contingency').length,
            rejected:    todayInvoices.filter(i => i.dian_status === 'rejected').length,
          },
          week: {
            total:       weekInvoices.length,
            approved:    weekInvoices.filter(i => i.dian_status === 'approved').length,
            contingency: weekInvoices.filter(i => i.dian_status === 'contingency').length,
            rejected:    weekInvoices.filter(i => i.dian_status === 'rejected').length,
          },
        });
      } catch (err) {
        console.error('[DianPage] metrics:', err);
        setMetrics({ today: null, week: null });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [organizationId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-3">
        <Loader2 size={18} className="animate-spin text-gray-300" />
        <span className="text-sm text-gray-400">Cargando métricas…</span>
      </div>
    );
  }

  const { today, week } = metrics || {};

  const periods = [
    { label: 'Hoy', data: today },
    { label: 'Últimos 7 días', data: week },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {periods.map(({ label, data }) => {
        if (!data) return null;
        const successRate = data.total > 0
          ? Math.round((data.approved / data.total) * 100)
          : 0;

        return (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
              {data.total > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  successRate >= 90 ? 'bg-green-100 text-green-700'
                  : successRate >= 70 ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
                }`}>
                  {successRate}% éxito
                </span>
              )}
            </div>

            {data.total === 0 ? (
              <div className="text-center py-6 text-gray-300">
                <FileText size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs">Sin facturas electrónicas</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <MetricBox value={data.total}       label="Total emitidas" color="gray"  />
                <MetricBox value={data.approved}    label="Aprobadas DIAN" color="green" />
                <MetricBox value={data.contingency} label="En contingencia" color="amber" />
                <MetricBox value={data.rejected}    label="Rechazadas"     color="red"   />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetricBox({ value, label, color }) {
  const colors = {
    gray:  'bg-gray-50  text-gray-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red:   'bg-red-50   text-red-600',
  };
  return (
    <div className={`rounded-xl p-3 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] font-medium mt-0.5 opacity-70">{label}</p>
    </div>
  );
}

// =============================================================================
// SECCIÓN 3: ContingencyTab — Facturas en contingencia + reintento
// =============================================================================

function ContingencyTab({ organizationId }) {
  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [retrying, setRetrying] = useState(null); // invoiceNumber que se está reintentando

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('electronic_invoices')
        .select('id, invoice_number, order_id, issued_at, dian_status, dian_errors')
        .eq('organization_id', organizationId)
        .eq('dian_status', 'contingency')
        .order('issued_at', { ascending: false })
        .limit(50);
      setInvoices(data || []);
    } catch (err) {
      console.error('[DianPage] contingency:', err);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  async function retryOne(orderId, invoiceNumber) {
    setRetrying(invoiceNumber);
    try {
      const { data } = await api.post('/dian/retry-contingency', { orderId });
      if (data.succeeded > 0) {
        toast.success(`✅ Factura ${invoiceNumber} transmitida exitosamente`);
        await load();
      } else {
        const errorMsg = data.results?.[0]?.error || 'Error desconocido';
        toast.error(`❌ Error: ${errorMsg}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al reintentar');
    } finally {
      setRetrying(null);
    }
  }

  async function retryAll() {
    setRetrying('__all__');
    try {
      const { data } = await api.post('/dian/retry-contingency', {});
      toast.success(`${data.succeeded}/${data.retried} facturas transmitidas`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al reintentar todas');
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header con acción */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Facturas en contingencia</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Facturas que no pudieron transmitirse a la DIAN por error de red o del PTA
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {invoices.length > 0 && (
            <button
              onClick={retryAll}
              disabled={!!retrying}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors">
              {retrying === '__all__'
                ? <Loader2 size={13} className="animate-spin" />
                : <RotateCcw size={13} />
              }
              Reintentar todas
            </button>
          )}
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-gray-300" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <CheckCircle2 size={36} className="mx-auto mb-3 text-green-300" />
          <p className="text-sm font-medium text-gray-600">Sin facturas en contingencia</p>
          <p className="text-xs text-gray-400 mt-1">Todas las facturas han sido transmitidas exitosamente a la DIAN</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Nº Factura', 'Fecha', 'Estado', 'Error', 'Acción'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-amber-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-gray-800">{inv.invoice_number}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {inv.issued_at
                      ? format(parseISO(inv.issued_at), "d MMM, h:mm a", { locale: es })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      <Clock size={9} />
                      Contingencia
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {inv.dian_errors ? (
                      <p className="text-[10px] text-red-500 truncate" title={JSON.stringify(inv.dian_errors)}>
                        {typeof inv.dian_errors === 'string'
                          ? inv.dian_errors
                          : inv.dian_errors?.message || inv.dian_errors?.[0]?.message || 'Ver detalle'}
                      </p>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => retryOne(inv.order_id, inv.invoice_number)}
                      disabled={!!retrying}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold
                                 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200
                                 rounded-lg transition-colors disabled:opacity-50">
                      {retrying === inv.invoice_number
                        ? <Loader2 size={11} className="animate-spin" />
                        : <RotateCcw size={11} />
                      }
                      Reintentar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">
              {invoices.length} factura{invoices.length !== 1 ? 's' : ''} en contingencia
              — Se puede reintentar cada una individualmente o todas a la vez
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SECCIÓN 4: NITValidatorTab — Validación de NIT en tiempo real
// =============================================================================

function NITValidatorTab() {
  const [input,   setInput]   = useState('');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);

  async function validate() {
    const nit = input.replace(/[^0-9]/g, '');
    if (!nit || nit.length < 5) {
      toast.error('Ingresa un NIT de al menos 5 dígitos');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      // Endpoint público: no requiere autenticación
      const { data } = await api.get(`/dian/validate-nit/${nit}`);
      setResult(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al validar NIT');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') validate();
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-0.5">Validar NIT colombiano</h2>
        <p className="text-xs text-gray-400">
          Calcula el dígito verificador usando el algoritmo oficial DIAN (Módulo 11)
        </p>
      </div>

      {/* Input */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">NIT (con o sin DV)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={input}
                onChange={e => { setInput(e.target.value); setResult(null); }}
                onKeyDown={handleKeyDown}
                placeholder="Sin DV: 890903938 | Con DV: 8909039388 (10 dígitos)"
                className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-xl text-sm
                           outline-none focus:ring-2 focus:ring-brand-400 font-mono"
              />
            </div>
            <button
              onClick={validate}
              disabled={!input.trim() || loading}
              className="px-4 h-10 bg-brand-600 hover:bg-brand-700 disabled:opacity-50
                         text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Validar
            </button>
          </div>
        </div>

        {/* Resultado */}
        {result && (
          <div className={`rounded-xl p-4 border-2 ${
            result.isValid
              ? 'bg-green-50 border-green-300'
              : 'bg-red-50 border-red-300'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {result.isValid
                ? <CheckCircle size={16} className="text-green-600" />
                : <AlertCircle size={16} className="text-red-500" />
              }
              <span className={`text-sm font-bold ${result.isValid ? 'text-green-700' : 'text-red-600'}`}>
                {result.isValid ? 'NIT Válido' : 'NIT Inválido'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">NIT base</span>
                <span className="text-sm font-mono font-semibold text-gray-900">{result.nit}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Dígito verificador (DV)</span>
                <span className={`text-lg font-bold font-mono ${result.isValid ? 'text-green-700' : 'text-red-600'}`}>
                  {result.dv}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-white/50 pt-2 mt-2">
                <span className="text-xs text-gray-500">Formato DIAN</span>
                <span className="text-sm font-mono font-bold text-gray-900">{result.formatted}</span>
              </div>
            </div>

            <p className="text-[10px] text-gray-500 mt-3 bg-white/60 rounded-lg px-2.5 py-1.5">
              {result.message}
            </p>
          </div>
        )}

        {/* Ejemplos */}
        <div>
          <p className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wide">Ejemplos para probar</p>
          <div className="flex flex-wrap gap-1.5">
            {['890903938', '900900783', '800251941'].map(nit => (
              <button
                key={nit}
                onClick={() => { setInput(nit); setResult(null); }}
                className="text-[10px] font-mono px-2 py-1 rounded-lg bg-gray-100 hover:bg-brand-50
                           text-gray-600 hover:text-brand-700 transition-colors border border-gray-200
                           hover:border-brand-200">
                {nit}
              </button>
            ))}
          </div>
        </div>

        {/* Nota técnica */}
        <div className="bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">
          <p className="text-[10px] text-brand-600 leading-relaxed">
            <strong>Algoritmo:</strong> Módulo 11 — primes [3,7,13,17,19,23,29,37,41,43,47,53,59,67,71]
            aplicados de derecha a izquierda. DV = (suma % 11 &lt; 2) ? (suma % 11) : (11 − suma % 11).
            Conforme a la especificación oficial de la DIAN.
          </p>
        </div>
      </div>
    </div>
  );
}
