// =============================================================================
// FERZU POS — MÓDULO DE TALLER MECÁNICO
// Archivo: src/pages/WorkshopPage.jsx
// Nicho: workshop | Órdenes de trabajo, repuestos, presupuestos, estado
// =============================================================================
// SECCIONES:
//   1. WorkshopPage.jsx       — Layout principal (tablero Kanban)
//   2. WorkOrderCard.jsx      — Tarjeta de orden de trabajo
//   3. WorkOrderForm.jsx      — Crear / editar orden de trabajo
//   4. WorkOrderDetail.jsx    — Vista completa: repuestos + mano de obra
//   5. VehicleHistory.jsx     — Historial de vehículo por placa
//   6. useWorkOrders.js       — Hook con Supabase Realtime
// =============================================================================
// SQL ADICIONAL REQUERIDO (agregar al schema):
// Ver bloque al pie de este archivo
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Wrench, Car, User, Clock, Plus, ChevronRight, Search,
  PhoneCall, CheckCircle2, AlertCircle, Package, DollarSign,
  RefreshCw, MessageCircle, Loader2, Edit2, Printer,
  ArrowRight, History, FileText, Zap
} from 'lucide-react';
import { supabase }  from '../lib/supabase.js';
import { useAuth }   from '../context/AuthContext.jsx';
import { formatCOP } from '../lib/math.js';
import toast         from 'react-hot-toast';
import { useTrack }  from '../hooks/useTrack.js';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';

// =============================================================================
// Configuración de columnas Kanban del taller
// =============================================================================

const COLUMNS = {
  received:    { label: 'Recibido',      color: 'border-gray-400  bg-gray-50',   badge: 'bg-gray-500',    textColor: 'text-gray-700'   },
  diagnosing:  { label: 'Diagnóstico',   color: 'border-amber-400 bg-amber-50',  badge: 'bg-amber-500',   textColor: 'text-amber-700'  },
  approved:    { label: 'Aprobado',      color: 'border-blue-400  bg-blue-50',   badge: 'bg-blue-500',    textColor: 'text-blue-700'   },
  in_progress: { label: 'En taller',     color: 'border-brand-400 bg-brand-50',  badge: 'bg-brand-500',   textColor: 'text-brand-700'  },
  ready:       { label: 'Listo',         color: 'border-green-400 bg-green-50',  badge: 'bg-green-500',   textColor: 'text-green-700'  },
  delivered:   { label: 'Entregado',     color: 'border-purple-400 bg-purple-50',badge: 'bg-purple-500',  textColor: 'text-purple-700' },
};

// =============================================================================
// SECCIÓN 1: WorkshopPage — Tablero Kanban de órdenes de trabajo
// =============================================================================

export default function WorkshopPage() {
  const { organizationId, branchId, user } = useAuth();
  const track = useTrack();
  useEffect(() => { track('module_view', 'workshop') }, [track]);
  const [showForm,    setShowForm]    = useState(false);
  const [editOrder,   setEditOrder]   = useState(null);
  const [viewOrder,   setViewOrder]   = useState(null);
  const [showHistory, setShowHistory] = useState(null);
  const [search,      setSearch]      = useState('');

  const { orders, loading, refresh } = useWorkOrders(branchId);

  // Filtrar por búsqueda (placa, cliente, servicio)
  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    return !q
      || o.vehicle_plate?.toLowerCase().includes(q)
      || o.customer_name?.toLowerCase().includes(q)
      || o.vehicle_model?.toLowerCase().includes(q);
  });

  // Agrupar por estado
  const grouped = {};
  for (const col of Object.keys(COLUMNS)) grouped[col] = [];
  for (const o of filtered) {
    if (grouped[o.status]) grouped[o.status].push(o);
  }

  async function moveOrder(orderId, newStatus) {
    const { error } = await supabase
      .from('work_orders')
      .update({
        status:                 newStatus,
        [`${newStatus}_at`]:    new Date().toISOString(),
        updated_at:             new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) { toast.error('Error al actualizar'); return; }
    toast.success(`Orden movida a: ${COLUMNS[newStatus].label}`);
    refresh();
  }

  async function sendWhatsApp(order) {
    const statusMsg = {
      ready: `Hola ${order.customer_name}, tu vehículo ${order.vehicle_plate} está listo para retirar en el taller. 🚗✅`,
      approved: `Hola ${order.customer_name}, tu presupuesto para el ${order.vehicle_plate} fue aprobado y iniciamos el trabajo. 🔧`,
    };
    const msg = statusMsg[order.status] || `Actualización de tu vehículo ${order.vehicle_plate} en nuestro taller.`;
    const phone = order.customer_phone?.replace(/\D/g, '');
    if (phone) window.open(`https://wa.me/57${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    else toast.error('Sin número de WhatsApp');
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Wrench size={20} className="text-brand-600" />
            Taller
          </h1>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Placa, cliente, modelo..."
              className="h-8 pl-8 pr-3 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-400 w-52"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { setEditOrder(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <Plus size={15} />
            Nueva O.T.
          </button>
        </div>
      </div>

      {/* Tablero Kanban */}
      <div className="flex-1 flex gap-3 p-4 overflow-x-auto">
        {Object.entries(COLUMNS).map(([colKey, col]) => {
          const colOrders = grouped[colKey] || [];
          return (
            <div key={colKey} className="flex-none w-64 flex flex-col">
              {/* Header columna */}
              <div className={`flex items-center justify-between mb-2 px-3 py-2 rounded-xl border-2 ${col.color}`}>
                <span className={`text-xs font-semibold ${col.textColor}`}>{col.label}</span>
                <span className={`text-[10px] text-white font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>
                  {colOrders.length}
                </span>
              </div>

              {/* Órdenes */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {colOrders.map(order => (
                  <WorkOrderCard
                    key={order.id}
                    order={order}
                    colKey={colKey}
                    onMove={moveOrder}
                    onView={() => setViewOrder(order)}
                    onWhatsApp={() => sendWhatsApp(order)}
                    onHistory={() => setShowHistory(order.vehicle_plate)}
                  />
                ))}
                {colOrders.length === 0 && (
                  <div className="text-center py-8 text-gray-300 text-xs">
                    <Wrench size={22} className="mx-auto mb-1 opacity-30" />
                    Vacío
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modales */}
      {showForm && (
        <WorkOrderForm
          order={editOrder}
          branchId={branchId}
          organizationId={organizationId}
          onClose={() => { setShowForm(false); setEditOrder(null); }}
          onSaved={refresh}
        />
      )}
      {viewOrder && (
        <WorkOrderDetail
          order={viewOrder}
          branchId={branchId}
          onClose={() => setViewOrder(null)}
          onMove={moveOrder}
          onSaved={refresh}
        />
      )}
      {showHistory && (
        <VehicleHistory
          plate={showHistory}
          organizationId={organizationId}
          onClose={() => setShowHistory(null)}
        />
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 2: WorkOrderCard — Tarjeta Kanban de orden de trabajo
// =============================================================================

function WorkOrderCard({ order, colKey, onMove, onView, onWhatsApp, onHistory }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function calc() {
      const mins = differenceInMinutes(new Date(), parseISO(order.received_at || order.created_at));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    calc();
    const id = setInterval(calc, 60_000);
    return () => clearInterval(id);
  }, [order]);

  const nextStatus = {
    received:    'diagnosing',
    diagnosing:  'approved',
    approved:    'in_progress',
    in_progress: 'ready',
    ready:       'delivered',
  };

  const nextLabel = {
    received:    'Iniciar diagnóstico',
    diagnosing:  'Enviar presupuesto',
    approved:    'Iniciar trabajo',
    in_progress: 'Marcar listo',
    ready:       'Marcar entregado',
  };

  const urgentHours = { received: 1, diagnosing: 2, approved: 4, in_progress: 8 };
  const hoursInCol  = differenceInMinutes(new Date(), parseISO(order[`${colKey}_at`] || order.created_at)) / 60;
  const isUrgent    = urgentHours[colKey] && hoursInCol >= urgentHours[colKey];

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
      isUrgent ? 'border-red-300' : 'border-gray-200'
    }`}>
      {/* Header de la tarjeta */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-gray-900">{order.vehicle_plate}</span>
            {isUrgent && <AlertCircle size={13} className="text-red-500" />}
          </div>
          <span className="text-[10px] text-gray-400">{elapsed}</span>
        </div>

        <p className="text-xs text-gray-600 font-medium">{order.vehicle_brand} {order.vehicle_model}</p>
        <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
          <User size={10} /> {order.customer_name}
        </p>

        {/* Servicios */}
        {order.services_summary && (
          <p className="text-[11px] text-gray-500 mt-1.5 bg-gray-50 rounded-lg px-2 py-1 leading-snug line-clamp-2">
            🔧 {order.services_summary}
          </p>
        )}

        {/* Total presupuesto */}
        {order.budget_total > 0 && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-gray-400">Presupuesto</span>
            <span className="text-xs font-semibold text-brand-700">{formatCOP(order.budget_total)}</span>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="border-t border-gray-100 flex">
        <button onClick={onView}
          className="flex-1 py-2 text-[10px] text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1 transition-colors">
          <FileText size={11} /> Ver
        </button>
        <button onClick={onWhatsApp}
          className="flex-1 py-2 text-[10px] text-green-600 hover:bg-green-50 flex items-center justify-center gap-1 transition-colors border-l border-gray-100">
          <MessageCircle size={11} /> WA
        </button>
        <button onClick={onHistory}
          className="flex-1 py-2 text-[10px] text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1 transition-colors border-l border-gray-100">
          <History size={11} /> Placa
        </button>
        {nextStatus[colKey] && (
          <button
            onClick={() => onMove(order.id, nextStatus[colKey])}
            className="flex-1 py-2 text-[10px] text-brand-600 hover:bg-brand-50 flex items-center justify-center gap-0.5 font-semibold transition-colors border-l border-gray-100">
            {nextLabel[colKey].split(' ')[0]} <ArrowRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 3: WorkOrderForm — Crear nueva orden de trabajo
// =============================================================================

function WorkOrderForm({ order, branchId, organizationId, onClose, onSaved }) {
  const isEdit = !!order;
  const [form, setForm] = useState({
    vehicle_plate:  order?.vehicle_plate  || '',
    vehicle_brand:  order?.vehicle_brand  || '',
    vehicle_model:  order?.vehicle_model  || '',
    vehicle_year:   order?.vehicle_year   || '',
    vehicle_color:  order?.vehicle_color  || '',
    vehicle_km:     order?.vehicle_km     || '',
    customer_name:  order?.customer_name  || '',
    customer_phone: order?.customer_phone || '',
    services_summary: order?.services_summary || '',
    notes:          order?.notes          || '',
  });
  const [saving, setSaving] = useState(false);

  function update(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.vehicle_plate || !form.customer_name) {
      toast.error('Placa y nombre del cliente son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const plate = form.vehicle_plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const payload = {
        ...form,
        vehicle_plate: plate,
        branch_id:     branchId,
        organization_id: organizationId,
        status:        'received',
        received_at:   new Date().toISOString(),
        budget_total:  0,
      };

      if (isEdit) {
        await supabase.from('work_orders').update(payload).eq('id', order.id);
      } else {
        await supabase.from('work_orders').insert(payload);
      }

      toast.success(isEdit ? 'Orden actualizada' : '¡Orden de trabajo creada!');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Wrench size={16} className="text-brand-600" />
            {isEdit ? 'Editar orden' : 'Nueva orden de trabajo'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Vehículo */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Vehículo</p>
            <div className="space-y-3">
              <WField label="Placa *" value={form.vehicle_plate} onChange={v => update('vehicle_plate', v.toUpperCase())} placeholder="ABC123" />
              <div className="grid grid-cols-3 gap-2">
                <WField label="Marca" value={form.vehicle_brand} onChange={v => update('vehicle_brand', v)} placeholder="Chevrolet" />
                <WField label="Modelo" value={form.vehicle_model} onChange={v => update('vehicle_model', v)} placeholder="Spark" />
                <WField label="Año" value={form.vehicle_year} onChange={v => update('vehicle_year', v)} placeholder="2020" type="number" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <WField label="Color" value={form.vehicle_color} onChange={v => update('vehicle_color', v)} placeholder="Rojo" />
                <WField label="Kilometraje" value={form.vehicle_km} onChange={v => update('vehicle_km', v)} placeholder="45000" type="number" />
              </div>
            </div>
          </div>

          {/* Cliente */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <WField label="Nombre *" value={form.customer_name} onChange={v => update('customer_name', v)} placeholder="Juan Pérez" />
              <WField label="Teléfono / WhatsApp" value={form.customer_phone} onChange={v => update('customer_phone', v)} placeholder="310 000 0000" />
            </div>
          </div>

          {/* Servicios */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Servicios solicitados</p>
            <textarea
              value={form.services_summary}
              onChange={e => update('services_summary', e.target.value)}
              rows={3}
              placeholder="Ej: Cambio de aceite 5W-30, filtro de aire, revisión de frenos..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400 resize-none"
            />
          </div>

          {/* Notas internas */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Notas internas</p>
            <textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              rows={2}
              placeholder="Observaciones del vehículo al recibirlo (rayones, faltantes, etc.)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400 resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving}
            className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {saving ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear orden de trabajo')}
          </button>
        </div>
      </div>
    </div>
  );
}

function WField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-9 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400" />
    </div>
  );
}


// =============================================================================
// SECCIÓN 4: WorkOrderDetail — Vista detalle con repuestos y mano de obra
// =============================================================================

function WorkOrderDetail({ order, branchId, onClose, onMove, onSaved }) {
  const [items,   setItems]   = useState(order.work_order_items || []);
  const [newItem, setNewItem] = useState({ description: '', qty: 1, unit_price: '', type: 'labor' });
  const [saving,  setSaving]  = useState(false);

  // Calcular totales (SOLO para display — el backend recalcula al cerrar)
  const totalLabor  = items.filter(i => i.type === 'labor').reduce((s, i) => s + i.qty * i.unit_price, 0);
  const totalParts  = items.filter(i => i.type === 'part').reduce((s, i) => s + i.qty * i.unit_price, 0);
  const totalBudget = totalLabor + totalParts;

  async function addItem() {
    if (!newItem.description || !newItem.unit_price) return;
    const item = {
      work_order_id: order.id,
      description:   newItem.description,
      qty:           Number(newItem.qty),
      unit_price:    Math.round(Number(newItem.unit_price)),
      type:          newItem.type,
    };
    const { data, error } = await supabase.from('work_order_items').insert(item).select().single();
    if (error) { toast.error('Error al agregar'); return; }

    const updatedItems = [...items, data];
    setItems(updatedItems);
    const newTotal = updatedItems.reduce((s, i) => s + i.qty * i.unit_price, 0);
    await supabase.from('work_orders').update({ budget_total: Math.round(newTotal) }).eq('id', order.id);
    setNewItem({ description: '', qty: 1, unit_price: '', type: 'labor' });
    onSaved();
  }

  async function removeItem(itemId) {
    await supabase.from('work_order_items').delete().eq('id', itemId);
    const updatedItems = items.filter(i => i.id !== itemId);
    setItems(updatedItems);
    const newTotal = updatedItems.reduce((s, i) => s + i.qty * i.unit_price, 0);
    await supabase.from('work_orders').update({ budget_total: Math.round(newTotal) }).eq('id', order.id);
    onSaved();
  }

  const nextStatus = { received:'diagnosing', diagnosing:'approved', approved:'in_progress', in_progress:'ready', ready:'delivered' };
  const nextLabel  = { received:'Iniciar diagnóstico', diagnosing:'Enviar presupuesto', approved:'Iniciar trabajo', in_progress:'Marcar listo', ready:'Marcar entregado' };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              🚗 {order.vehicle_plate}
              <span className="text-sm font-normal text-gray-500">
                {order.vehicle_brand} {order.vehicle_model} {order.vehicle_year}
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {order.customer_name} · {order.customer_phone}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {/* Servicios solicitados */}
          {order.services_summary && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
              🔧 {order.services_summary}
            </div>
          )}

          {/* Tabla de repuestos y mano de obra */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Presupuesto</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="text-left px-3 py-2 rounded-tl-lg">Descripción</th>
                  <th className="text-center px-3 py-2">Tipo</th>
                  <th className="text-center px-3 py-2">Cant.</th>
                  <th className="text-right px-3 py-2">Precio unit.</th>
                  <th className="text-right px-3 py-2 rounded-tr-lg">Subtotal</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(item => (
                  <tr key={item.id} className="group">
                    <td className="px-3 py-2 text-gray-800">{item.description}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        item.type === 'labor' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {item.type === 'labor' ? 'M.O.' : 'Repuesto'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600">{item.qty}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatCOP(item.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatCOP(item.qty * item.unit_price)}</td>
                    <td className="py-2">
                      <button onClick={() => removeItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Agregar ítem */}
          <div className="bg-gray-50 rounded-2xl p-3 mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">+ Agregar repuesto o mano de obra</p>
            <div className="flex gap-2">
              <input
                type="text" value={newItem.description}
                onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))}
                placeholder="Descripción" className="flex-1 h-9 border border-gray-200 rounded-xl px-3 text-xs outline-none focus:ring-2 focus:ring-brand-400"
              />
              <select value={newItem.type} onChange={e => setNewItem(n => ({ ...n, type: e.target.value }))}
                className="h-9 border border-gray-200 rounded-xl px-2 text-xs outline-none">
                <option value="labor">M.O.</option>
                <option value="part">Repuesto</option>
              </select>
              <input type="number" value={newItem.qty}
                onChange={e => setNewItem(n => ({ ...n, qty: e.target.value }))}
                className="w-16 h-9 border border-gray-200 rounded-xl px-2 text-xs outline-none text-center" min={1}
              />
              <input type="number" value={newItem.unit_price}
                onChange={e => setNewItem(n => ({ ...n, unit_price: e.target.value }))}
                placeholder="Precio" className="w-28 h-9 border border-gray-200 rounded-xl px-2 text-xs outline-none"
              />
              <button onClick={addItem}
                className="h-9 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition-colors">
                Agregar
              </button>
            </div>
          </div>

          {/* Totales */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Mano de obra</span>
              <span>{formatCOP(totalLabor)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Repuestos</span>
              <span>{formatCOP(totalParts)}</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
              <span>Total presupuesto</span>
              <span className="text-brand-700">{formatCOP(totalBudget)}</span>
            </div>
          </div>
        </div>

        {/* Footer de acciones */}
        {nextStatus[order.status] && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={() => { onMove(order.id, nextStatus[order.status]); onClose(); }}
              className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
              <ArrowRight size={16} />
              {nextLabel[order.status]}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 5: VehicleHistory — Historial por placa
// =============================================================================

function VehicleHistory({ plate, organizationId, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('work_orders')
      .select('id, vehicle_brand, vehicle_model, vehicle_year, vehicle_km, services_summary, budget_total, status, created_at')
      .eq('organization_id', organizationId)
      .eq('vehicle_plate', plate)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setHistory(data || []); setLoading(false); });
  }, [plate]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <History size={16} className="text-brand-600" />
            Historial — 🚗 {plate}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10">Sin historial para esta placa</p>
          ) : history.map(h => (
            <div key={h.id} className="border border-gray-200 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">
                  {format(parseISO(h.created_at), "d 'de' MMMM yyyy", { locale: es })}
                </span>
                <span className="text-xs text-gray-400">
                  {h.vehicle_km ? `${Number(h.vehicle_km).toLocaleString()} km` : '—'}
                </span>
              </div>
              <p className="text-xs text-gray-600 mb-1">{h.services_summary || 'Sin descripción'}</p>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  h.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>{COLUMNS[h.status]?.label || h.status}</span>
                <span className="text-sm font-bold text-brand-700">{formatCOP(h.budget_total)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 6: useWorkOrders — Hook con Supabase Realtime
// =============================================================================

export function useWorkOrders(branchId) {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!branchId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('work_orders')
        .select('*, work_order_items(*)')
        .eq('branch_id', branchId)
        .not('status', 'eq', 'delivered')
        .order('created_at', { ascending: false });
      setOrders(data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    const ch = supabase.channel(`workshop:${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `branch_id=eq.${branchId}` }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [branchId]);

  return { orders, loading, refresh: load };
}


// =============================================================================
// SQL ADICIONAL — Agregar a ferzu_schema.sql
// =============================================================================
/*
-- Tabla de órdenes de trabajo
CREATE TABLE IF NOT EXISTS work_orders (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id         UUID NOT NULL REFERENCES branches(id),
  vehicle_plate     TEXT NOT NULL,
  vehicle_brand     TEXT,
  vehicle_model     TEXT,
  vehicle_year      INTEGER,
  vehicle_color     TEXT,
  vehicle_km        BIGINT,
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT,
  services_summary  TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','diagnosing','approved','in_progress','ready','delivered','cancelled')),
  budget_total      BIGINT NOT NULL DEFAULT 0,
  received_at       TIMESTAMPTZ DEFAULT NOW(),
  diagnosing_at     TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  in_progress_at    TIMESTAMPTZ,
  ready_at          TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Ítems de la orden (repuestos y mano de obra)
CREATE TABLE IF NOT EXISTS work_order_items (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'labor' CHECK (type IN ('labor','part')),
  qty            INTEGER NOT NULL DEFAULT 1,
  unit_price     BIGINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE work_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_work_orders" ON work_orders
  USING (organization_id = get_org_id());
CREATE POLICY "org_isolation_work_order_items" ON work_order_items
  USING (work_order_id IN (SELECT id FROM work_orders WHERE organization_id = get_org_id()));

-- Índice por placa para historial rápido
CREATE INDEX IF NOT EXISTS idx_work_orders_plate ON work_orders(organization_id, vehicle_plate);
CREATE INDEX IF NOT EXISTS idx_work_orders_branch ON work_orders(branch_id, status);
*/
