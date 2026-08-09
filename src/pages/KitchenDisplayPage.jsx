// =============================================================================
// FERZU POS — KITCHEN DISPLAY SYSTEM (KDS)
// Archivo: src/pages/KitchenDisplayPage.jsx
// Supabase Realtime: pedidos en tiempo real · Timers · Estado por ítem
// Nicho: restaurant | cafetería | comidas rápidas
// =============================================================================
// CONTENIDO:
//   Sección 1: KitchenDisplayPage.jsx — Layout principal del KDS
//   Sección 2: OrderTicket.jsx        — Ticket de pedido por columna/estado
//   Sección 3: OrderItem.jsx          — Ítem individual con estado
//   Sección 4: KDSHeader.jsx          — Header con stats en tiempo real
//   Sección 5: useKitchenOrders.js    — Hook con Supabase Realtime
//   Sección 6: KDSSettings.jsx        — Panel de ajustes del KDS
// =============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Flame, CheckCircle2, Clock, AlertTriangle, Volume2, VolumeX,
  Settings, RefreshCw, Bell, ChefHat, Utensils, Timer,
  ArrowRight, Maximize2, RotateCcw, Filter, Monitor,
  CheckCheck, Pause, X, ZapOff
} from 'lucide-react';
import { supabase }   from '../lib/supabase.js';
import { useAuth }    from '../context/AuthContext.jsx';
import { usePOS }     from '../context/POSContext.jsx';
import { useNavigate } from 'react-router-dom';
import { formatCOP }  from '../lib/math.js';
import { differenceInSeconds, format, parseISO } from 'date-fns';

// =============================================================================
// Constantes del KDS
// =============================================================================

const KDS_COLS = {
  pending:    { label: 'Nuevos',       color: 'border-amber-400  bg-amber-50',  icon: Bell,          textColor: 'text-amber-700',   badge: 'bg-amber-500' },
  in_kitchen: { label: 'En cocina',    color: 'border-brand-400  bg-brand-50',  icon: Flame,         textColor: 'text-brand-700',   badge: 'bg-brand-500' },
  ready:      { label: 'Listos',       color: 'border-green-400  bg-green-50',  icon: CheckCircle2,  textColor: 'text-green-700',   badge: 'bg-green-500' },
  served:     { label: 'Entregados',   color: 'border-gray-300   bg-gray-50',   icon: CheckCheck,    textColor: 'text-gray-500',    badge: 'bg-gray-400'  },
};

// Umbrales de tiempo (segundos) para alertas de color
const WARN_SECS  = 8 * 60;   // 8 min → amarillo
const URGENT_SECS = 15 * 60; // 15 min → rojo

// Sonidos inline (base64 short beep — reemplazar con audioContext o archivos .mp3)
function playBeep(freq = 800, ms = 150) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch (_) { /* sin permisos de audio */ }
}

// =============================================================================
// SECCIÓN 1: KitchenDisplayPage — Layout principal
// =============================================================================

export default function KitchenDisplayPage() {
  const { organizationId } = useAuth();
  const { branchId } = usePOS();
  const navigate = useNavigate();
  const [sound,       setSound]       = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [filterTable,  setFilterTable]  = useState('all'); // 'all' | 'dine_in' | 'delivery'
  const [visibleCols,  setVisibleCols]  = useState(['pending','in_kitchen','ready']);

  const { orders, stats, loading, refresh } = useKitchenOrders(branchId, {
    onNewOrder: () => { if (sound) playBeep(880, 200); },
    onReadyOrder: () => { if (sound) playBeep(440, 300); },
  });

  // Filtrar por tipo de mesa
  const filteredOrders = filterTable === 'all' ? orders
    : orders.filter(o => o.order_type === filterTable);

  // Agrupar por estado
  const grouped = {};
  for (const col of Object.keys(KDS_COLS)) grouped[col] = [];
  for (const order of filteredOrders) {
    if (grouped[order.kitchen_status]) grouped[order.kitchen_status].push(order);
  }

  async function handleStatusChange(orderId, newStatus) {
    const { error } = await supabase
      .from('orders')
      .update({
        kitchen_status: newStatus,
        [`${newStatus}_at`]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) console.error('KDS update error:', error);
    else refresh();
  }

  async function handleItemToggle(orderId, itemId, done) {
    const { error } = await supabase
      .from('order_items')
      .update({ kitchen_done: done, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (!error) refresh();
  }

  // Guard: KDS sin sucursal no puede mostrar pedidos
  if (!branchId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 bg-gray-900 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-900/40 flex items-center justify-center">
          <ChefHat size={32} className="text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Selecciona una sucursal</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-xs">
            Para ver los pedidos de cocina necesitas abrir el POS y seleccionar la sucursal activa.
          </p>
        </div>
        <button
          onClick={() => navigate('/pos')}
          className="px-5 py-2.5 bg-brand-600 text-white rounded-xl font-semibold
                     hover:bg-brand-700 transition-colors text-sm">
          Ir al POS →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">

      {/* ── Header ── */}
      <KDSHeader
        stats={stats}
        loading={loading}
        sound={sound}
        filterTable={filterTable}
        onSoundToggle={() => setSound(s => !s)}
        onFilterChange={setFilterTable}
        onSettings={() => setShowSettings(true)}
        onRefresh={refresh}
      />

      {/* ── Columnas del KDS ── */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden">
        {visibleCols.map(colKey => {
          const col    = KDS_COLS[colKey];
          const colOrders = grouped[colKey] || [];
          const Icon   = col.icon;

          return (
            <div key={colKey} className="flex-1 flex flex-col min-w-0 max-w-sm">
              {/* Cabecera columna */}
              <div className={`flex items-center justify-between mb-2 px-3 py-2 rounded-xl border-2 ${col.color}`}>
                <div className={`flex items-center gap-2 font-semibold text-sm ${col.textColor}`}>
                  <Icon size={15} />
                  {col.label}
                </div>
                <span className={`text-xs text-white font-bold px-2 py-0.5 rounded-full ${col.badge}`}>
                  {colOrders.length}
                </span>
              </div>

              {/* Tickets */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                {colOrders.length === 0 ? (
                  <div className="text-center py-10 text-gray-600">
                    <Icon size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Sin pedidos</p>
                  </div>
                ) : colOrders.map(order => (
                  <OrderTicket
                    key={order.id}
                    order={order}
                    currentStatus={colKey}
                    onStatusChange={handleStatusChange}
                    onItemToggle={handleItemToggle}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Columna oculta: Entregados (siempre visible en barra lateral) */}
        {!visibleCols.includes('served') && (
          <div className="w-10 flex flex-col items-center gap-2 py-2">
            <div className="text-gray-600 text-[10px] writing-mode-vertical rotate-90 whitespace-nowrap">
              Entregados: {grouped.served?.length || 0}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de ajustes ── */}
      {showSettings && (
        <KDSSettings
          visibleCols={visibleCols}
          onColsChange={setVisibleCols}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 2: OrderTicket — Ticket completo de un pedido
// =============================================================================

function OrderTicket({ order, currentStatus, onStatusChange, onItemToggle }) {
  const [elapsed, setElapsed]   = useState(0);
  const [expanded, setExpanded] = useState(true);

  // Referencia al tiempo de creación del ticket en cocina
  const kitchenStartAt = order.in_kitchen_at || order.created_at;

  // Timer en vivo
  useEffect(() => {
    const calc = () => setElapsed(differenceInSeconds(new Date(), parseISO(kitchenStartAt)));
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [kitchenStartAt]);

  const urgency = elapsed >= URGENT_SECS ? 'urgent'
                : elapsed >= WARN_SECS   ? 'warn'
                : 'ok';

  const urgencyStyles = {
    ok:     'border-gray-700 bg-gray-800',
    warn:   'border-amber-500 bg-amber-900/20 animate-pulse-slow',
    urgent: 'border-red-500 bg-red-900/20 animate-pulse',
  };

  const urgencyTimer = {
    ok:     'text-gray-400',
    warn:   'text-amber-400 font-bold',
    urgent: 'text-red-400 font-bold',
  };

  function formatElapsed(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  const nextStatus = {
    pending:    'in_kitchen',
    in_kitchen: 'ready',
    ready:      'served',
  };

  const nextLabel = {
    pending:    '🔥 Iniciar',
    in_kitchen: '✅ Listo',
    ready:      '🛎 Entregado',
  };

  const allItemsDone = order.order_items?.every(i => i.kitchen_done) ?? false;
  const doneCount    = order.order_items?.filter(i => i.kitchen_done).length ?? 0;
  const totalItems   = order.order_items?.length ?? 0;

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${urgencyStyles[urgency]}`}>
      {/* Header del ticket */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}>

        <div className="flex items-center gap-2">
          {/* Número de mesa / tipo */}
          <div className="bg-white/10 rounded-lg px-2 py-0.5 text-xs font-bold text-white">
            {order.order_type === 'dine_in'
              ? `Mesa ${order.tables?.number || '—'}`
              : order.order_type === 'delivery' ? '🛵 Delivery'
              : '🥡 Para llevar'}
          </div>
          <span className="text-xs text-gray-400">#{String(order.order_number || '').padStart(3,'0')}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Progreso ítems */}
          {currentStatus === 'in_kitchen' && (
            <span className="text-[10px] text-gray-400">{doneCount}/{totalItems}</span>
          )}
          {/* Timer */}
          <span className={`text-sm font-mono ${urgencyTimer[urgency]}`}>
            {formatElapsed(elapsed)}
          </span>
          {urgency === 'urgent' && <AlertTriangle size={13} className="text-red-400" />}
        </div>
      </div>

      {/* Ítems del pedido */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {order.order_items?.map(item => (
            <OrderItem
              key={item.id}
              item={item}
              showToggle={currentStatus === 'in_kitchen'}
              onToggle={done => onItemToggle(order.id, item.id, done)}
            />
          ))}

          {/* Notas del pedido */}
          {order.notes && (
            <div className="mt-1.5 text-[10px] text-amber-300 bg-amber-900/30 rounded-lg px-2 py-1.5 border border-amber-700">
              📝 {order.notes}
            </div>
          )}

          {/* Tiempo de pedido */}
          <div className="text-[10px] text-gray-600 mt-1">
            Pedido: {format(parseISO(order.created_at), 'h:mm a')}
            {order.in_kitchen_at && ` · Cocina: ${format(parseISO(order.in_kitchen_at), 'h:mm a')}`}
          </div>
        </div>
      )}

      {/* Barra de progreso ítems (in_kitchen) */}
      {currentStatus === 'in_kitchen' && totalItems > 0 && (
        <div className="h-1 bg-gray-700">
          <div
            className="h-1 bg-brand-500 transition-all duration-300"
            style={{ width: `${(doneCount / totalItems) * 100}%` }}
          />
        </div>
      )}

      {/* Botón de acción */}
      {nextStatus[currentStatus] && (
        <button
          onClick={() => onStatusChange(order.id, nextStatus[currentStatus])}
          disabled={currentStatus === 'in_kitchen' && !allItemsDone}
          className={`w-full py-2 text-xs font-semibold transition-all ${
            currentStatus === 'in_kitchen' && !allItemsDone
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : currentStatus === 'pending'
              ? 'bg-brand-600 hover:bg-brand-700 text-white active:scale-95'
              : currentStatus === 'in_kitchen'
              ? 'bg-green-600 hover:bg-green-700 text-white active:scale-95'
              : 'bg-gray-600 hover:bg-gray-500 text-white active:scale-95'
          }`}>
          {currentStatus === 'in_kitchen' && !allItemsDone
            ? `⏳ Completar ${totalItems - doneCount} ítem(s) restante(s)`
            : nextLabel[currentStatus]}
        </button>
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 3: OrderItem — Ítem individual con checkbox de cocina
// =============================================================================

function OrderItem({ item, showToggle, onToggle }) {
  return (
    <div
      className={`flex items-start gap-2 py-1 transition-opacity ${item.kitchen_done ? 'opacity-40' : ''}`}
      onClick={() => showToggle && onToggle(!item.kitchen_done)}>

      {showToggle && (
        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors cursor-pointer ${
          item.kitchen_done ? 'bg-green-500 border-green-500' : 'border-gray-500'
        }`}>
          {item.kitchen_done && <CheckCircle2 size={11} className="text-white" />}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-xs font-bold text-white shrink-0 ${item.kitchen_done ? 'line-through' : ''}`}>
            ×{item.quantity}
          </span>
          <span className={`text-xs text-gray-200 truncate ${item.kitchen_done ? 'line-through text-gray-500' : ''}`}>
            {item.product_name}
          </span>
        </div>

        {/* Modificaciones / notas del ítem */}
        {item.modifiers && item.modifiers.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {item.modifiers.map((mod, i) => (
              <span key={i} className="text-[10px] bg-white/10 rounded px-1 text-gray-400">
                {mod.label || mod}
              </span>
            ))}
          </div>
        )}
        {item.notes && (
          <p className="text-[10px] text-amber-400 mt-0.5 italic">⚡ {item.notes}</p>
        )}
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 4: KDSHeader — Header con estadísticas en tiempo real
// =============================================================================

function KDSHeader({ stats, loading, sound, filterTable, onSoundToggle, onFilterChange, onSettings, onRefresh }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-gray-950 border-b border-gray-800 px-4 py-2 flex items-center justify-between shrink-0">
      {/* Logo + hora */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <ChefHat size={18} className="text-brand-400" />
          <span className="font-bold text-sm text-white">FERZU KDS</span>
        </div>
        <span className="text-sm font-mono text-gray-400">
          {format(now, 'hh:mm:ss a')}
        </span>
      </div>

      {/* Stats en tiempo real */}
      <div className="flex items-center gap-4">
        {[
          { label: 'Nuevos',    value: stats.pending,    color: 'text-amber-400' },
          { label: 'En cocina', value: stats.in_kitchen, color: 'text-brand-400' },
          { label: 'Listos',    value: stats.ready,      color: 'text-green-400' },
          { label: 'Promedio',  value: stats.avgTime ? `${stats.avgTime}m` : '—', color: 'text-gray-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-[10px] text-gray-600 leading-none">{label}</div>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="flex items-center gap-2">
        {/* Filtro tipo pedido */}
        <div className="flex bg-gray-800 rounded-lg overflow-hidden">
          {[['all','Todos'],['dine_in','Mesa'],['delivery','Delivery']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => onFilterChange(val)}
              className={`text-[11px] px-2 py-1 transition-colors ${
                filterTable === val ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={onSoundToggle}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          title={sound ? 'Silenciar' : 'Activar sonido'}>
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        <button
          onClick={onRefresh}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>

        <button
          onClick={onSettings}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 5: useKitchenOrders — Hook con Supabase Realtime
// =============================================================================

export function useKitchenOrders(branchId, { onNewOrder, onReadyOrder } = {}) {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(false);
  const prevIds = useRef(new Set());

  // Refs para callbacks — evita stale closures cuando sound cambia en el padre
  const onNewOrderRef   = useRef(onNewOrder);
  const onReadyOrderRef = useRef(onReadyOrder);
  onNewOrderRef.current   = onNewOrder;
  onReadyOrderRef.current = onReadyOrder;

  const ACTIVE_STATUSES = ['pending', 'in_kitchen', 'ready', 'served'];

  async function load() {
    if (!branchId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_number, order_type, kitchen_status, notes,
          created_at, in_kitchen_at, ready_at, served_at,
          tables(id, number),
          order_items(
            id, product_name, quantity, notes, modifiers,
            kitchen_done, kitchen_station
          )
        `)
        .eq('branch_id', branchId)
        .in('kitchen_status', ACTIVE_STATUSES)
        .not('kitchen_status', 'eq', 'served')
        .order('created_at', { ascending: true });

      if (!error) {
        // Detectar nuevos pedidos para disparar sonido
        const newSet = new Set((data || []).map(o => o.id));
        if (prevIds.current.size > 0) {
          for (const id of newSet) {
            if (!prevIds.current.has(id)) onNewOrderRef.current?.();
          }
        }
        prevIds.current = newSet;
        setOrders(data || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [branchId]);

  // Supabase Realtime — suscribir a cambios en orders y order_items
  useEffect(() => {
    if (!branchId) return;

    const channel = supabase
      .channel(`kitchen:${branchId}:${Date.now()}`)
      // Nuevos pedidos
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'orders',
        filter: `branch_id=eq.${branchId}`,
      }, () => load())

      // Cambios de estado de pedidos
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'orders',
        filter: `branch_id=eq.${branchId}`,
      }, (payload) => {
        const updated = payload.new;
        if (updated.kitchen_status === 'ready') onReadyOrderRef.current?.();
        setOrders(prev => prev.map(o =>
          o.id === updated.id ? { ...o, ...updated } : o
        ).filter(o => ACTIVE_STATUSES.includes(o.kitchen_status) && o.kitchen_status !== 'served'));
      })

      // Cambios en ítems (kitchen_done toggle)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'order_items',
      }, (payload) => {
        const updatedItem = payload.new;
        setOrders(prev => prev.map(order => ({
          ...order,
          order_items: (order.order_items || []).map(item =>
            item.id === updatedItem.id ? { ...item, ...updatedItem } : item
          ),
        })));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [branchId]);

  // Calcular estadísticas
  const stats = {
    pending:    orders.filter(o => o.kitchen_status === 'pending').length,
    in_kitchen: orders.filter(o => o.kitchen_status === 'in_kitchen').length,
    ready:      orders.filter(o => o.kitchen_status === 'ready').length,
    avgTime: (() => {
      const completed = orders.filter(o => o.in_kitchen_at && o.ready_at);
      if (!completed.length) return null;
      const avg = completed.reduce((sum, o) => {
        return sum + differenceInSeconds(parseISO(o.ready_at), parseISO(o.in_kitchen_at));
      }, 0) / completed.length;
      return Math.round(avg / 60);
    })(),
  };

  return { orders, stats, loading, refresh: load };
}


// =============================================================================
// SECCIÓN 6: KDSSettings — Panel de configuración del KDS
// =============================================================================

function KDSSettings({ visibleCols, onColsChange, onClose }) {
  const [cols, setCols] = useState(visibleCols);

  function toggleCol(colKey) {
    setCols(prev =>
      prev.includes(colKey) ? prev.filter(c => c !== colKey) : [...prev, colKey]
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Settings size={16} className="text-brand-400" />
            Ajustes del KDS
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Columnas visibles</p>
            <div className="space-y-2">
              {Object.entries(KDS_COLS).map(([key, col]) => {
                const Icon = col.icon;
                return (
                  <label key={key} className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <Icon size={14} />
                      {col.label}
                    </div>
                    <div
                      onClick={() => toggleCol(key)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${
                        cols.includes(key) ? 'bg-brand-500' : 'bg-gray-700'
                      }`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        cols.includes(key) ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500 mb-2">Tiempos de alerta</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-gray-400">Advertencia: {WARN_SECS / 60} minutos</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-gray-400">Urgente: {URGENT_SECS / 60} minutos</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 mt-1">Configurable en constants.js</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-800">
          <button
            onClick={() => { onColsChange(cols); onClose(); }}
            className="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors">
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// NOTA: Migración SQL requerida en Supabase
// Agregar columnas al schema existente (ferzu_schema.sql):
// =============================================================================
/*
-- Columnas para el KDS (agregar a la tabla orders):
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kitchen_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (kitchen_status IN ('pending','in_kitchen','ready','served','cancelled')),
  ADD COLUMN IF NOT EXISTS in_kitchen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS served_at     TIMESTAMPTZ;

-- Columnas para ítems del KDS:
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS kitchen_done     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kitchen_station  TEXT,       -- 'grill' | 'cold' | 'bar'
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS modifiers        JSONB DEFAULT '[]'::jsonb;

-- Índice de rendimiento para el KDS:
CREATE INDEX IF NOT EXISTS idx_orders_kitchen
  ON orders(branch_id, kitchen_status, created_at);

-- Trigger automático: cuando todos los ítems están done → sugerir 'ready'
CREATE OR REPLACE FUNCTION check_kitchen_completion()
RETURNS TRIGGER AS $$
DECLARE
  total_items  INTEGER;
  done_items   INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE kitchen_done = true)
    INTO total_items, done_items
    FROM order_items WHERE order_id = NEW.order_id;

  IF total_items > 0 AND total_items = done_items THEN
    -- Notificar via pg_notify para que el frontend pueda reaccionar
    PERFORM pg_notify(
      'kitchen_complete',
      json_build_object('order_id', NEW.order_id, 'branch_id',
        (SELECT branch_id FROM orders WHERE id = NEW.order_id)
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kitchen_completion
  AFTER UPDATE OF kitchen_done ON order_items
  FOR EACH ROW EXECUTE FUNCTION check_kitchen_completion();
*/
