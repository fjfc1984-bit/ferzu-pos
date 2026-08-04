// =============================================================================
// FERZU POS — IntegrationsPage
// F4: Hub de integraciones externas
//
// Sección 1: Plataformas delivery (Rappi / UberEats / DiDi Food)
//   - Muestra la URL del webhook que la plataforma debe registrar
//   - Permite configurar branch_id + toggle enabled
//
// Sección 2: Exportación contable
//   - Rango de fechas + branch
//   - Descarga CSV Siigo (Colombia) o CSV Genérico (Xero / QB)
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Download, RefreshCw, Copy, CheckCircle2, AlertCircle,
  ChevronDown, ChevronRight, Globe, FileText, Link2,
  Building2, Calendar, Settings2, Zap, Info
} from 'lucide-react';
import { useAuth }     from '../context/AuthContext.jsx';
import { format, subDays } from 'date-fns';
import { es }          from 'date-fns/locale';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// =============================================================================
// Helpers
// =============================================================================
function getToken() {
  try {
    const raw = localStorage.getItem('sb-laimnfckldpiovgbugyr-auth-token');
    return raw ? JSON.parse(raw)?.access_token : null;
  } catch { return null; }
}

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res;
}

// =============================================================================
// PLATAFORMAS CONFIG
// =============================================================================
const PLATFORMS = [
  {
    id:    'rappi',
    name:  'Rappi',
    color: 'bg-orange-500',
    logo:  '🛵',
    desc:  'Pedidos de Rappi llegan automáticamente al POS como órdenes delivery.',
    docsUrl: 'https://dev.rappi.com/docs/webhooks',
    header: 'x-rappi-signature',
  },
  {
    id:    'ubereats',
    name:  'Uber Eats',
    color: 'bg-green-600',
    logo:  '🚗',
    desc:  'Integración con UberEats Merchant API. Requiere aprobación del equipo UberEats.',
    docsUrl: 'https://developer.uber.com/docs/eats/introduction',
    header: 'x-uber-signature',
  },
  {
    id:    'didi',
    name:  'DiDi Food',
    color: 'bg-orange-600',
    logo:  '🍜',
    desc:  'Pedidos de DiDi Food Colombia integrados en tiempo real.',
    docsUrl: 'https://food-open.didichuxing.com',
    header: 'x-didi-signature',
  },
];

// =============================================================================
// PlatformCard
// =============================================================================
function PlatformCard({ platform, config, branches, onSave, backendUrl }) {
  const [expanded,  setExpanded]  = useState(false);
  const [branchId,  setBranchId]  = useState(config?.branch_id || '');
  const [enabled,   setEnabled]   = useState(config?.enabled   || false);
  const [secret,    setSecret]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [saveOk,    setSaveOk]    = useState(false);

  const webhookUrl = `${backendUrl}/webhooks/${platform.id}`;

  function copyUrl() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSave() {
    if (!branchId) return;
    setSaving(true);
    try {
      await apiFetch('/api/integrations/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          platform: platform.id,
          branch_id: branchId,
          enabled,
          ...(secret ? { webhook_secret: secret } : {}),
        }),
      });
      setSaveOk(true);
      setSecret('');
      setTimeout(() => setSaveOk(false), 2500);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isConfigured = config?.configured;
  const isActive     = config?.enabled && isConfigured && branchId;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-10 h-10 rounded-xl ${platform.color} flex items-center justify-center text-xl text-white shadow-md`}>
          {platform.logo}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{platform.name}</span>
            {isActive
              ? <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Activo</span>
              : isConfigured
              ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Configurado · deshabilitado</span>
              : <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">Sin configurar</span>
            }
          </div>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{platform.desc}</p>
        </div>
        {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t border-gray-100 space-y-4">

          {/* URL del webhook */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              URL del Webhook <span className="text-gray-400 font-normal">(registrar en el panel de {platform.name})</span>
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-mono text-gray-700 truncate">
                {webhookUrl}
              </code>
              <button
                onClick={copyUrl}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {copied ? <CheckCircle2 size={13} className="text-green-600" /> : <Copy size={13} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <a
                href={platform.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              >
                <Globe size={13} />
                Docs
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Header de firma: <code className="bg-gray-100 px-1 rounded text-gray-600">{platform.header}</code>
            </p>
          </div>

          {/* Branch */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Sucursal donde llegan los pedidos
            </label>
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">Seleccionar sucursal…</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Webhook Secret <span className="text-gray-400 font-normal">(opcional — valida la firma del webhook)</span>
            </label>
            <input
              type="password"
              placeholder={isConfigured ? '••••••••  (ya guardado)' : 'Pegar el secret de la plataforma'}
              value={secret}
              onChange={e => setSecret(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Toggle habilitado */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="sr-only"
            />
            <div className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm text-gray-700">{enabled ? 'Integración habilitada' : 'Integración deshabilitada'}</span>
          </label>

          {/* Guardar */}
          <button
            onClick={handleSave}
            disabled={saving || !branchId}
            className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : saveOk ? <CheckCircle2 size={14} /> : <Settings2 size={14} />}
            {saving ? 'Guardando…' : saveOk ? '¡Guardado!' : 'Guardar configuración'}
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ExportSection — Exportación contable
// =============================================================================
function ExportSection({ branches }) {
  const today     = format(new Date(), 'yyyy-MM-dd');
  const weekStart = format(subDays(new Date(), 6), 'yyyy-MM-dd');

  const [dateFrom,  setDateFrom]  = useState(weekStart);
  const [dateTo,    setDateTo]    = useState(today);
  const [branchId,  setBranchId]  = useState('');
  const [loadingS,  setLoadingS]  = useState(false);
  const [loadingG,  setLoadingG]  = useState(false);
  const [error,     setError]     = useState('');

  async function download(type) {
    const setter = type === 'siigo' ? setLoadingS : setLoadingG;
    setter(true);
    setError('');
    try {
      const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (branchId) qs.set('branch_id', branchId);
      const res = await apiFetch(`/api/integrations/export/${type}?${qs}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${type}_export_${dateFrom}_${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setter(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <FileText size={20} className="text-indigo-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Exportación contable</h3>
          <p className="text-xs text-gray-400">CSV listo para importar en Siigo, Xero o QuickBooks</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Desde</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Hasta</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Sucursal (opcional)</label>
          <div className="relative">
            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">Todas las sucursales</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-sm">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Botones de descarga */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Siigo */}
        <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <span className="text-sm font-bold text-emerald-700">S</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Siigo Colombia</p>
              <p className="text-xs text-gray-400">Formato FV — Facturas de venta</p>
            </div>
          </div>
          <ul className="text-xs text-gray-500 space-y-0.5">
            <li>✓ TipoDoc, Prefijo, Número, Fecha</li>
            <li>✓ NIT + Nombre cliente</li>
            <li>✓ Ítem, Cantidad, ValorUnitario</li>
            <li>✓ IVA%, IVA$, Total, Método pago</li>
          </ul>
          <button
            onClick={() => download('siigo')}
            disabled={loadingS}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {loadingS ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {loadingS ? 'Generando…' : 'Descargar Siigo CSV'}
          </button>
        </div>

        {/* Genérico (Xero / QB) */}
        <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <span className="text-sm font-bold text-blue-600">X</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Xero / QuickBooks</p>
              <p className="text-xs text-gray-400">Formato genérico internacional</p>
            </div>
          </div>
          <ul className="text-xs text-gray-500 space-y-0.5">
            <li>✓ Date, InvoiceNumber, Customer</li>
            <li>✓ Description, Qty, UnitPrice</li>
            <li>✓ TaxRate, TaxAmount, Tip</li>
            <li>✓ LineTotal, OrderTotal, PaymentMethod</li>
          </ul>
          <button
            onClick={() => download('generic')}
            disabled={loadingG}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loadingG ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {loadingG ? 'Generando…' : 'Descargar CSV Genérico'}
          </button>
        </div>
      </div>

      {/* Nota informativa */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 text-blue-700 text-xs">
        <Info size={14} className="mt-0.5 shrink-0" />
        <div>
          Los CSV incluyen BOM UTF-8 para apertura correcta en Excel. Solo se exportan órdenes en estado <strong>completado</strong>.
          El CSV de Siigo usa COP (pesos colombianos) sin decimales, conforme al formato de importación estándar de Siigo Nube.
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// IntegrationsPage — Componente principal
// =============================================================================
export default function IntegrationsPage() {
  const { user, organizationId } = useAuth();
  const [settings, setSettings]  = useState({});
  const [branches, setBranches]  = useState([]);
  const [loading,  setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('delivery'); // 'delivery' | 'export'

  const isAdmin = ['admin', 'owner'].includes(user?.role);

  // Detectar la URL base del backend para mostrar el webhook URL
  const backendUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace('/api', '').replace(/\/$/, '');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, branchesRes] = await Promise.all([
        apiFetch('/api/integrations/settings'),
        fetch(`${API}/api/org/branches`, {
          headers: {
            'Content-Type': 'application/json',
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          },
        }),
      ]);
      const settingsData = await settingsRes.json();
      const branchesData = await branchesRes.json();
      setSettings(settingsData);
      setBranches(Array.isArray(branchesData) ? branchesData : branchesData.branches || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl mx-auto mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-800">Acceso restringido</h2>
          <p className="text-gray-500 text-sm mt-2">Solo administradores pueden configurar integraciones externas.</p>
        </div>
      </div>
    );
  }

  const TABS = [
    { id: 'delivery', label: '🛵 Plataformas delivery', icon: Zap },
    { id: 'export',   label: '📊 Exportación contable', icon: Download },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-md">
            <Link2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Integraciones</h1>
            <p className="text-sm text-gray-500">Conecta plataformas de delivery y tu software contable</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-emerald-500" />
        </div>
      ) : (
        <>
          {/* Tab: Delivery */}
          {activeTab === 'delivery' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 text-amber-700 text-xs">
                <Info size={14} className="mt-0.5 shrink-0" />
                <div>
                  Las plataformas envían pedidos a las URLs de abajo. FERZU POS los convierte automáticamente
                  en órdenes tipo <strong>delivery</strong> visibles desde el POS y la cocina.
                  El webhook secret es opcional pero recomendado para validar la autenticidad.
                </div>
              </div>
              {PLATFORMS.map(platform => (
                <PlatformCard
                  key={platform.id}
                  platform={platform}
                  config={settings[platform.id]}
                  branches={branches}
                  onSave={loadData}
                  backendUrl={backendUrl}
                />
              ))}
            </div>
          )}

          {/* Tab: Export */}
          {activeTab === 'export' && (
            <ExportSection branches={branches} />
          )}
        </>
      )}
    </div>
  );
}
