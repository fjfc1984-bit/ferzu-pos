// =============================================================================
// FERZU POS — MÓDULO DE MINIMARKET / TIENDA
// Archivo: src/pages/MinimarketPage.jsx
// Nicho: minimarket | Balanza, vencimientos, lotes, etiquetas de precio
// =============================================================================
// SECCIONES:
//   1. MinimarketPage.jsx       — Layout principal con tabs
//   2. ScaleIntegration.jsx     — Integración balanza serial (Web Serial API)
//   3. ExpiryTracker.jsx        — Control de fechas de vencimiento
//   4. BatchManager.jsx         — Gestión de lotes
//   5. PriceTagPrinter.jsx      — Generador de etiquetas de precio (PDF)
//   6: ExpiryAlertBanner.jsx    — Banner de alertas de vencimiento próximo
// =============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scale, AlertTriangle, Package, Tag, Calendar, QrCode,
  RefreshCw, Plus, Printer, CheckCircle2, Clock, Zap,
  ChevronDown, ChevronRight, Loader2, Trash2, Search,
  AlertCircle, X, ShoppingCart
} from 'lucide-react';
import { supabase }  from '../lib/supabase.js';
import { useAuth }   from '../context/AuthContext.jsx';
import { formatCOP } from '../lib/math.js';
import toast         from 'react-hot-toast';
import { format, parseISO, differenceInDays, isPast, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

// =============================================================================
// SECCIÓN 1: MinimarketPage — Layout con tabs
// =============================================================================

export default function MinimarketPage() {
  const { organizationId, branchId } = useAuth();
  const [tab, setTab] = useState('scale');

  const TABS = [
    { key: 'scale',   label: 'Balanza',       icon: Scale    },
    { key: 'expiry',  label: 'Vencimientos',  icon: Calendar },
    { key: 'batches', label: 'Lotes',         icon: Package  },
    { key: 'labels',  label: 'Etiquetas',     icon: Tag      },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Banner de alertas */}
      <ExpiryAlertBanner branchId={branchId} />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 pt-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ShoppingCart size={20} className="text-brand-600" />
            Minimarket
          </h1>
        </div>
        <div className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? 'border-brand-500 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'scale'   && <ScaleIntegration   branchId={branchId} organizationId={organizationId} />}
        {tab === 'expiry'  && <ExpiryTracker       branchId={branchId} organizationId={organizationId} />}
        {tab === 'batches' && <BatchManager        branchId={branchId} organizationId={organizationId} />}
        {tab === 'labels'  && <PriceTagPrinter     organizationId={organizationId} />}
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 2: ScaleIntegration — Balanza por Web Serial API
// Compatible con balanzas Cas, Toledo, Mettler que usan protocolo RS-232
// =============================================================================

function ScaleIntegration({ branchId, organizationId }) {
  const [weight,      setWeight]      = useState(null);   // gramos
  const [product,     setProduct]     = useState(null);
  const [pricePerKg,  setPricePerKg]  = useState(0);
  const [connected,   setConnected]   = useState(false);
  const [reading,     setReading]     = useState(false);
  const [search,      setSearch]      = useState('');
  const [results,     setResults]     = useState([]);
  const portRef = useRef(null);
  const readerRef = useRef(null);

  // Precio calculado por el backend (determinista)
  // peso en gramos → precio = (peso / 1000) * precio_por_kg
  const calculatedPrice = product && weight != null
    ? Math.round((weight / 1000) * pricePerKg)
    : null;

  // Buscar productos por peso (pricePerKg > 0)
  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, emoji, price, metadata')
        .eq('organization_id', organizationId)
        .ilike('name', `%${search}%`)
        .eq('is_active', true)
        .limit(8);
      setResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, organizationId]);

  function selectProduct(p) {
    setProduct(p);
    setPricePerKg(p.metadata?.price_per_kg || p.price);
    setSearch(p.name);
    setResults([]);
  }

  // Conectar a la balanza por Web Serial API
  async function connectScale() {
    if (!('serial' in navigator)) {
      toast.error('Tu navegador no soporta Web Serial. Usa Chrome 89+ o Edge.');
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });
      portRef.current = port;
      setConnected(true);
      setReading(true);
      readScaleLoop(port);
      toast.success('Balanza conectada');
    } catch (err) {
      if (err.name !== 'NotFoundError') toast.error('Error al conectar balanza: ' + err.message);
    }
  }

  async function readScaleLoop(port) {
    const reader = port.readable.getReader();
    readerRef.current = reader;
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        buffer += text;

        // Parsear tramas de peso (formato varía por marca)
        // CAS: "ST,GS,  +0.350kg\r\n"  → buscar número + unidad
        // Toledo: "+000350\r\n" → gramos
        const match = buffer.match(/([+-]?\d+\.?\d*)\s*(kg|g|lb)/i);
        if (match) {
          let w = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          if (unit === 'kg' || unit === 'lb') w = unit === 'lb' ? w * 453.592 : w * 1000;
          setWeight(Math.round(w));
          buffer = '';
        }
        if (buffer.length > 100) buffer = '';
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Scale read error:', err);
    } finally {
      reader.releaseLock();
    }
  }

  async function disconnectScale() {
    try {
      readerRef.current?.cancel();
      await portRef.current?.close();
    } catch {}
    setConnected(false);
    setReading(false);
    setWeight(null);
    portRef.current  = null;
    readerRef.current = null;
    toast('Balanza desconectada');
  }

  // Simular peso (modo demo sin balanza física)
  function simulateWeight() {
    const w = Math.round(100 + Math.random() * 900);
    setWeight(w);
  }

  async function addToOrder() {
    if (!product || weight == null || !calculatedPrice) return;
    // En producción: this.pos.addItem(product.id, weight/1000, calculatedPrice)
    // Por ahora mostrar toast con los datos que se pasarían al POS
    toast.success(`${product.metadata?.emoji || product.emoji || '📦'} ${product.name} · ${(weight/1000).toFixed(3)} kg · ${formatCOP(calculatedPrice)}`);
    setWeight(null);
  }

  return (
    <div className="flex flex-col h-full p-6 max-w-2xl mx-auto">
      {/* Display de balanza */}
      <div className={`rounded-3xl p-6 mb-5 text-center transition-all ${
        connected ? 'bg-brand-900 text-white' : 'bg-gray-900 text-white'
      }`}>
        <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">
          {connected ? '⚡ Balanza conectada' : '○ Sin balanza'}
        </div>

        <div className="text-6xl font-bold font-mono tabular-nums mb-1">
          {weight != null ? (weight / 1000).toFixed(3) : '0.000'}
        </div>
        <div className="text-white/60 text-sm">kilogramos</div>

        {calculatedPrice != null && (
          <div className="mt-4 bg-white/10 rounded-2xl py-3">
            <p className="text-white/60 text-xs mb-1">Precio a cobrar</p>
            <p className="text-3xl font-bold text-white">{formatCOP(calculatedPrice)}</p>
          </div>
        )}
      </div>

      {/* Producto seleccionado */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <p className="text-xs font-medium text-gray-500 mb-2">Producto a pesar</p>
        <div className="relative">
          <input type="text" value={search}
            onChange={e => { setSearch(e.target.value); setProduct(null); }}
            placeholder="Buscar producto por peso (carne, queso, granos...)"
            className="w-full h-10 border border-gray-200 rounded-xl px-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-brand-400"
          />
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        {results.length > 0 && (
          <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {results.map(p => (
              <button key={p.id} onClick={() => selectProduct(p)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between text-sm">
                <span>{p.metadata?.emoji || p.emoji || '📦'} {p.name}</span>
                <span className="text-gray-400 text-xs">
                  {formatCOP(p.metadata?.price_per_kg || p.price)}/kg
                </span>
              </button>
            ))}
          </div>
        )}

        {product && (
          <div className="mt-2 flex items-center gap-2 bg-brand-50 rounded-xl px-3 py-2">
            <span className="text-lg">{product.metadata?.emoji || product.emoji || '📦'}</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-brand-800">{product.name}</p>
              <p className="text-xs text-brand-600">{formatCOP(pricePerKg)}/kg</p>
            </div>
            <button onClick={() => { setProduct(null); setSearch(''); setPricePerKg(0); }}>
              <X size={14} className="text-brand-400" />
            </button>
          </div>
        )}
      </div>

      {/* Botones de acción */}
      <div className="flex gap-3 mb-4">
        {!connected ? (
          <>
            <button onClick={connectScale}
              className="flex-1 h-12 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
              <Scale size={18} />
              Conectar balanza
            </button>
            <button onClick={simulateWeight}
              className="px-4 h-12 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-2xl text-sm transition-colors"
              title="Demo sin balanza física">
              Demo
            </button>
          </>
        ) : (
          <button onClick={disconnectScale}
            className="flex-1 h-12 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-2xl transition-colors">
            Desconectar
          </button>
        )}

        <button
          onClick={addToOrder}
          disabled={!product || weight == null || !calculatedPrice}
          className="flex-1 h-12 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
          <ShoppingCart size={18} />
          Agregar al POS
        </button>
      </div>

      <p className="text-center text-xs text-gray-400">
        Compatible con balanzas CAS, Toledo, Mettler (RS-232 · 9600 baudios) ·{' '}
        <a href="https://wicg.github.io/serial/" target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
          Requiere Chrome 89+
        </a>
      </p>
    </div>
  );
}


// =============================================================================
// SECCIÓN 3: ExpiryTracker — Control de fechas de vencimiento
// =============================================================================

function ExpiryTracker({ branchId, organizationId }) {
  const [batches,  setBatches]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all'); // 'expired'|'soon'|'ok'|'all'

  useEffect(() => { load(); }, [branchId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('product_batches')
      .select('*, products(id, name, emoji, sku)')
      .eq('branch_id', branchId)
      .gt('quantity', 0)
      .order('expiry_date');
    setBatches(data || []);
    setLoading(false);
  }

  function status(expiryDate) {
    if (!expiryDate) return 'no_date';
    const days = differenceInDays(parseISO(expiryDate), new Date());
    if (days < 0)  return 'expired';
    if (days <= 7) return 'critical';
    if (days <= 30) return 'soon';
    return 'ok';
  }

  const statusConfig = {
    expired:  { label: 'Vencido',     cls: 'bg-red-100 text-red-700 border-red-200',         icon: '⛔' },
    critical: { label: 'Crítico (≤7d)',cls: 'bg-orange-100 text-orange-700 border-orange-200', icon: '🔴' },
    soon:     { label: 'Próximo',     cls: 'bg-amber-100 text-amber-700 border-amber-200',    icon: '🟡' },
    ok:       { label: 'Vigente',     cls: 'bg-green-100 text-green-700 border-green-200',    icon: '🟢' },
    no_date:  { label: 'Sin fecha',   cls: 'bg-gray-100 text-gray-500 border-gray-200',       icon: '⚪' },
  };

  const counts = batches.reduce((acc, b) => {
    const s = status(b.expiry_date);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const filtered = batches.filter(b => {
    const s = status(b.expiry_date);
    if (filter === 'all') return true;
    if (filter === 'expired')  return s === 'expired' || s === 'critical';
    if (filter === 'soon')     return s === 'soon';
    if (filter === 'ok')       return s === 'ok';
    return true;
  });

  async function removeExpired(batchId) {
    if (!confirm('¿Dar de baja este lote vencido? Se registrará como merma.')) return;
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;

    await supabase.from('inventory_movements').insert({
      product_id:      batch.product_id,
      branch_id:       branchId,
      movement_type:   'waste',
      quantity_change: -batch.quantity,
      quantity_after:  0,
      notes:           `Lote #${batch.batch_number} vencido ${batch.expiry_date}`,
    });

    await supabase.from('product_batches')
      .update({ quantity: 0, status: 'removed', updated_at: new Date().toISOString() })
      .eq('id', batchId);

    // Actualizar inventario total
    const { data: inv } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('product_id', batch.product_id)
      .eq('branch_id', branchId)
      .maybeSingle();

    if (inv) {
      await supabase.from('inventory')
        .update({ quantity: Math.max(0, inv.quantity - batch.quantity) })
        .eq('product_id', batch.product_id)
        .eq('branch_id', branchId);
    }

    toast.success('Lote dado de baja como merma');
    load();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Resumen */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 shrink-0">
        {[
          { key: 'all',     label: 'Todos',    count: batches.length,           cls: 'bg-gray-100 text-gray-700' },
          { key: 'expired', label: 'Vencidos', count: (counts.expired||0)+(counts.critical||0), cls: 'bg-red-100 text-red-700' },
          { key: 'soon',    label: 'Próximos', count: counts.soon||0,           cls: 'bg-amber-100 text-amber-700' },
          { key: 'ok',      label: 'Vigentes', count: counts.ok||0,             cls: 'bg-green-100 text-green-700' },
        ].map(({ key, label, count, cls }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              filter === key ? cls + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {label}
            <span className="font-bold">{count}</span>
          </button>
        ))}

        <button onClick={load} className="ml-auto text-gray-400 hover:text-gray-600">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Calendar size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin lotes en esta categoría</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(b => {
              const s = status(b.expiry_date);
              const cfg = statusConfig[s];
              const days = b.expiry_date ? differenceInDays(parseISO(b.expiry_date), new Date()) : null;

              return (
                <div key={b.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${cfg.cls}`}>
                  <span className="text-lg shrink-0">{cfg.icon}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {b.products?.metadata?.emoji || b.products?.emoji || '📦'} {b.products?.name || '—'}
                      </span>
                      <span className="text-[10px] opacity-70 shrink-0">
                        Lote: {b.batch_number || 'S/N'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] opacity-70">
                      <span>📦 {b.quantity} uds</span>
                      {b.expiry_date && (
                        <span>
                          📅 Vence: {format(parseISO(b.expiry_date), 'd MMM yyyy', { locale: es })}
                          {days != null && (
                            <strong> ({days < 0 ? `hace ${Math.abs(days)}d` : days === 0 ? 'HOY' : `en ${days}d`})</strong>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {(s === 'expired' || s === 'critical') && (
                    <button onClick={() => removeExpired(b.id)}
                      className="shrink-0 text-[10px] font-medium px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                      Dar de baja
                    </button>
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
// SECCIÓN 4: BatchManager — Gestión de lotes (entrada con lote y fecha)
// =============================================================================

function BatchManager({ branchId, organizationId }) {
  const [batches,    setBatches]    = useState([]);
  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [form, setForm] = useState({
    product_id: '', batch_number: '', quantity: '',
    expiry_date: '', manufacture_date: '', unit_cost: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, [branchId]);

  async function loadAll() {
    setLoading(true);
    const [batchRes, prodRes] = await Promise.all([
      supabase.from('product_batches').select('*, products(name, emoji)').eq('branch_id', branchId).gt('quantity', 0).order('expiry_date'),
      supabase.from('products').select('id, name, emoji').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    ]);
    setBatches(batchRes.data || []);
    setProducts(prodRes.data || []);
    setLoading(false);
  }

  async function saveBatch() {
    if (!form.product_id || !form.quantity) { toast.error('Producto y cantidad son obligatorios'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('product_batches').insert({
        product_id:       form.product_id,
        branch_id:        branchId,
        batch_number:     form.batch_number || null,
        quantity:         Math.round(Number(form.quantity)),
        expiry_date:      form.expiry_date   || null,
        manufacture_date: form.manufacture_date || null,
        unit_cost:        form.unit_cost ? Math.round(Number(form.unit_cost)) : null,
        status:           'active',
      });

      if (error) throw error;

      // Sumar al inventario
      const { data: inv } = await supabase.from('inventory')
        .select('quantity').eq('product_id', form.product_id).eq('branch_id', branchId).maybeSingle();

      const newQty = (inv?.quantity || 0) + Math.round(Number(form.quantity));
      if (inv) {
        await supabase.from('inventory').update({ quantity: newQty }).eq('product_id', form.product_id).eq('branch_id', branchId);
      } else {
        await supabase.from('inventory').insert({ product_id: form.product_id, branch_id: branchId, quantity: newQty });
      }

      await supabase.from('inventory_movements').insert({
        product_id:      form.product_id,
        branch_id:       branchId,
        movement_type:   'purchase',
        quantity_change: Math.round(Number(form.quantity)),
        quantity_after:  newQty,
        unit_cost:       form.unit_cost ? Math.round(Number(form.unit_cost)) : null,
        notes:           form.batch_number ? `Lote: ${form.batch_number}` : 'Entrada sin número de lote',
      });

      toast.success('Lote registrado');
      setShowForm(false);
      setForm({ product_id: '', batch_number: '', quantity: '', expiry_date: '', manufacture_date: '', unit_cost: '' });
      loadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between shrink-0">
        <p className="text-sm font-medium text-gray-700">Lotes activos</p>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition-colors">
          <Plus size={13} /> Ingresar lote
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
        ) : (
          <table className="w-full text-sm bg-white rounded-2xl overflow-hidden border border-gray-200">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {['Producto','Lote','Cantidad','Vencimiento','Fabricación','Costo unit.'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map(b => {
                const days = b.expiry_date ? differenceInDays(parseISO(b.expiry_date), new Date()) : null;
                return (
                  <tr key={b.id} className={`hover:bg-gray-50 ${days != null && days <= 7 ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{b.products?.metadata?.emoji || b.products?.emoji || '📦'} {b.products?.name}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{b.batch_number || '—'}</td>
                    <td className="px-4 py-2.5 font-semibold">{b.quantity} uds</td>
                    <td className={`px-4 py-2.5 text-xs ${days != null && days <= 0 ? 'text-red-600 font-bold' : days != null && days <= 30 ? 'text-amber-600' : 'text-gray-500'}`}>
                      {b.expiry_date ? format(parseISO(b.expiry_date), 'd MMM yyyy', { locale: es }) : '—'}
                      {days != null && <span className="ml-1 opacity-60">({days < 0 ? `vencido` : `${days}d`})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">
                      {b.manufacture_date ? format(parseISO(b.manufacture_date), 'd MMM yyyy', { locale: es }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{b.unit_cost ? formatCOP(b.unit_cost) : '—'}</td>
                  </tr>
                );
              })}
              {batches.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">Sin lotes activos</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <Package size={15} className="text-brand-600" /> Ingresar lote
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Producto *</label>
                <select value={form.product_id} onChange={e => setForm(f => ({...f, product_id: e.target.value}))}
                  className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400">
                  <option value="">Seleccionar...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.metadata?.emoji || p.emoji || '📦'} {p.name}</option>)}
                </select>
              </div>
              {[
                ['batch_number','N° de lote','LOT-2024-001',  'text'],
                ['quantity',   'Cantidad *', '100',           'number'],
                ['unit_cost',  'Costo unit.','2500',          'number'],
              ].map(([key, label, placeholder, type]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
                  <input type={type} value={form[key]} placeholder={placeholder}
                    onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                {[['expiry_date','Fecha vencimiento'],['manufacture_date','Fecha fabricación']].map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
                    <input type="date" value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
                      className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400" />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={saveBatch} disabled={saving || !form.product_id || !form.quantity}
                className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? 'Guardando...' : 'Registrar lote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 5: PriceTagPrinter — Generador de etiquetas de precio
// Genera HTML imprimible con código de barras y precio en formato
// 5cm x 3cm (compatible con impresoras Zebra/DYMO o impresión normal)
// =============================================================================

function PriceTagPrinter({ organizationId }) {
  const [products,  setProducts]  = useState([]);
  const [selected,  setSelected]  = useState([]);
  const [search,    setSearch]    = useState('');
  const [copies,    setCopies]    = useState(1);
  const [size,      setSize]      = useState('medium'); // 'small'|'medium'|'large'

  useEffect(() => {
    supabase.from('products').select('id, name, emoji, price, sku, barcode')
      .eq('organization_id', organizationId).eq('is_active', true).order('name')
      .then(({ data }) => setProducts(data || []));
  }, [organizationId]);

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.includes(search)
  );

  function toggleSelect(p) {
    setSelected(s => s.some(x => x.id === p.id) ? s.filter(x => x.id !== p.id) : [...s, p]);
  }

  function printTags() {
    const tagStyle = {
      small:  'width:40mm;height:25mm;font-size:8pt;',
      medium: 'width:60mm;height:40mm;font-size:10pt;',
      large:  'width:80mm;height:50mm;font-size:12pt;',
    }[size];

    const tags = selected.flatMap(p =>
      Array.from({ length: copies }).map((_, i) => `
        <div style="${tagStyle}border:1px solid #ccc;padding:3mm;display:inline-block;margin:1mm;vertical-align:top;font-family:sans-serif;box-sizing:border-box;page-break-inside:avoid;">
          <div style="font-size:0.7em;color:#666;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${p.name}</div>
          ${p.sku ? `<div style="font-size:0.6em;color:#999;">SKU: ${p.sku}</div>` : ''}
          <div style="font-size:1.4em;font-weight:bold;color:#0F6E56;margin:1mm 0;">${formatCOP(p.price)}</div>
          ${p.barcode ? `<div style="font-size:0.6em;letter-spacing:1px;font-family:monospace;">${p.barcode}</div>` : ''}
        </div>
      `)
    ).join('');

    const win = window.open('', '_blank');
    if (!win) { alert('Habilita las ventanas emergentes para imprimir etiquetas'); return; }
    win.document.write(`
      <!DOCTYPE html><html><head>
        <title>Etiquetas FERZU</title>
        <style>@media print{body{margin:0;}}</style>
      </head><body>
        ${tags}
        <script>window.onload=()=>window.print();</script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <div className="flex h-full">
      {/* Panel izquierdo: selección */}
      <div className="flex-1 flex flex-col border-r border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..." className="w-full h-9 pl-8 pr-3 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filtered.map(p => (
            <label key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
              selected.some(x => x.id === p.id) ? 'bg-brand-50 border border-brand-200' : 'hover:bg-gray-50'
            }`}>
              <input type="checkbox" checked={selected.some(x => x.id === p.id)} onChange={() => toggleSelect(p)} className="accent-brand-600" />
              <span className="text-sm flex-1 truncate">{p.metadata?.emoji || p.emoji || '📦'} {p.name}</span>
              <span className="text-xs font-semibold text-gray-700 shrink-0">{formatCOP(p.price)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Panel derecho: opciones e impresión */}
      <div className="w-64 flex flex-col p-5 gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tamaño</p>
          <div className="space-y-1">
            {[['small','Pequeña (4×2.5 cm)'],['medium','Mediana (6×4 cm)'],['large','Grande (8×5 cm)']].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                <input type="radio" name="size" value={v} checked={size === v} onChange={() => setSize(v)} className="accent-brand-600" />
                {l}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Copias por etiqueta</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setCopies(c => Math.max(1, c-1))} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-bold">−</button>
            <span className="flex-1 text-center font-bold text-gray-900">{copies}</span>
            <button onClick={() => setCopies(c => Math.min(10, c+1))} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-bold">+</button>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
          <p className="font-medium text-gray-700 mb-1">{selected.length} producto(s) seleccionado(s)</p>
          <p>Total de etiquetas: {selected.length * copies}</p>
        </div>

        <button onClick={printTags} disabled={selected.length === 0}
          className="mt-auto w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
          <Printer size={16} />
          Imprimir etiquetas
        </button>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 6: ExpiryAlertBanner — Banner de alerta de vencimientos próximos
// Se muestra en la parte superior de la página si hay productos por vencer
// =============================================================================

export function ExpiryAlertBanner({ branchId }) {
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    const soon = addDays(new Date(), 7).toISOString().split('T')[0];
    supabase.from('product_batches')
      .select('id, expiry_date, quantity, products(name)')
      .eq('branch_id', branchId)
      .lte('expiry_date', soon)
      .gt('quantity', 0)
      .eq('status', 'active')
      .then(({ data }) => setAlerts(data || []));
  }, [branchId]);

  if (!alerts.length || dismissed) return null;

  const expired = alerts.filter(a => isPast(parseISO(a.expiry_date)));
  const soon    = alerts.filter(a => !isPast(parseISO(a.expiry_date)));

  return (
    <div className="bg-red-600 text-white px-4 py-2 flex items-center gap-2 text-xs shrink-0">
      <AlertTriangle size={14} className="shrink-0" />
      <span className="flex-1">
        {expired.length > 0 && <strong>{expired.length} lote(s) vencido(s)</strong>}
        {expired.length > 0 && soon.length > 0 && ' · '}
        {soon.length > 0 && <span>{soon.length} lote(s) vencen en menos de 7 días</span>}
        {' — Revisa el módulo de Vencimientos.'}
      </span>
      <button onClick={() => setDismissed(true)} className="text-white/70 hover:text-white">
        <X size={14} />
      </button>
    </div>
  );
}


// =============================================================================
// SQL ADICIONAL — Agregar a ferzu_schema.sql
// =============================================================================
/*
-- Tabla de lotes
CREATE TABLE IF NOT EXISTS product_batches (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id        UUID NOT NULL REFERENCES branches(id),
  batch_number     TEXT,
  quantity         INTEGER NOT NULL DEFAULT 0,
  unit_cost        BIGINT,
  manufacture_date DATE,
  expiry_date      DATE,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed','expired')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation_batches" ON product_batches
  USING (product_id IN (SELECT id FROM products WHERE organization_id = get_org_id()));

CREATE INDEX IF NOT EXISTS idx_batches_expiry
  ON product_batches(branch_id, expiry_date) WHERE status = 'active' AND quantity > 0;
*/
