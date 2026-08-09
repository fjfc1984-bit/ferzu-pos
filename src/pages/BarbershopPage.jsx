// =============================================================================
// FERZU POS — MÓDULO DE BARBERÍA / PELUQUERÍA / SPA
// Archivo: src/pages/BarbershopPage.jsx (y subcomponentes)
// Nicho: barbershop | Supabase Realtime para sala de espera en vivo
// =============================================================================
// CONTENIDO:
//   Sección 1: BarbershopPage.jsx       — Página principal (3 columnas)
//   Sección 2: AppointmentCalendar.jsx  — Calendario semanal de citas
//   Sección 3: WaitingRoom.jsx          — Sala de espera en tiempo real
//   Sección 4: NewAppointmentModal.jsx  — Crear nueva cita
//   Sección 5: StaffCommissions.jsx     — Reporte de comisiones por estilista
//   Sección 6: useAppointments.js       — Hook de citas con Realtime
// =============================================================================

import React, {
  useState, useEffect, useCallback, useRef
} from 'react';
import {
  Calendar, Clock, User, Scissors, Plus, ChevronLeft,
  ChevronRight, Phone, CheckCircle2, XCircle, RefreshCw,
  DollarSign, BarChart3, MessageCircle, Timer, ArrowRight,
  AlertCircle, Star, Zap
} from 'lucide-react';
import { supabase }   from '../lib/supabase.js';
import { useAuth }    from '../context/AuthContext.jsx';
import { usePOS }     from '../context/POSContext.jsx';
import { useNavigate } from 'react-router-dom';
import { formatCOP }  from '../lib/math.js';
import toast          from 'react-hot-toast';
import { useTrack }   from '../hooks/useTrack.js';
import { addDays, startOfWeek, format, isSameDay, parseISO, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';

// =============================================================================
// SECCIÓN 1: BarbershopPage.jsx — Layout principal de 3 columnas
// =============================================================================

export default function BarbershopPage() {
  const { organizationId, user }  = useAuth();
  const { branchId } = usePOS();
  const navigate = useNavigate();
  const track = useTrack();
  useEffect(() => { track('module_view', 'barbershop') }, [track]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showNewAppt,  setShowNewAppt]  = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null); // {date, time, staffId}
  const [activeStaff,  setActiveStaff]  = useState(null); // null = todos
  const [staffList,    setStaffList]    = useState([]);
  const [showCommissions, setShowCommissions] = useState(false);

  const { appointments, waitingList, loading, refresh } = useAppointments(branchId, selectedDate);

  // Cargar lista de estilistas
  useEffect(() => {
    if (!organizationId) return;
    supabase.from('users')
      .select('id, full_name, avatar_url, role, commission_pct')
      .eq('organization_id', organizationId)
      .in('role', ['cashier', 'technician'])
      .eq('is_active', true)
      .then(({ data }) => setStaffList(data || []));
  }, [organizationId]);

  const filteredAppts = activeStaff
    ? appointments.filter(a => a.staff_user_id === activeStaff)
    : appointments;

  // Guard: sin sucursal activa no hay agenda que mostrar
  if (!branchId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 bg-gray-50 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
          <Scissors size={32} className="text-amber-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Selecciona una sucursal</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xs">
            Para ver la agenda necesitas abrir el POS y seleccionar la sucursal activa.
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
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── COLUMNA 1: Filtros y staff ── */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <h1 className="font-semibold text-gray-900 flex items-center gap-2">
              <Scissors size={18} className="text-brand-600" />
              Barbería
            </h1>
            <button
              onClick={() => setShowCommissions(true)}
              className="text-gray-400 hover:text-brand-600"
              title="Comisiones">
              <BarChart3 size={16} />
            </button>
          </div>
          <p className="text-xs text-gray-400">
            {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </p>
        </div>

        {/* Estilistas */}
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[11px] text-gray-400 font-medium mb-2 uppercase tracking-wide">Estilistas</p>

          <button
            onClick={() => setActiveStaff(null)}
            className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm mb-1 transition-colors ${
              !activeStaff ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50'
            }`}>
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold">T</div>
            Todos
            <span className="ml-auto text-xs text-gray-400">{appointments.length}</span>
          </button>

          {staffList.map(staff => {
            const count = appointments.filter(a => a.staff_user_id === staff.id).length;
            return (
              <button
                key={staff.id}
                onClick={() => setActiveStaff(activeStaff === staff.id ? null : staff.id)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm mb-1 transition-colors ${
                  activeStaff === staff.id ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700 shrink-0">
                  {staff.full_name[0].toUpperCase()}
                </div>
                <span className="truncate flex-1">{staff.full_name.split(' ')[0]}</span>
                <span className="text-xs text-gray-400 shrink-0">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Stats del día */}
        <div className="p-3 border-t border-gray-100 space-y-2">
          {[
            { label: 'Citas del día',  value: appointments.filter(a => isSameDay(parseISO(a.start_at), selectedDate)).length, icon: Calendar },
            { label: 'En espera',    value: waitingList.filter(w => w.status === 'arrived').length, icon: Timer },
            { label: 'Completadas',  value: appointments.filter(a => isSameDay(parseISO(a.start_at), selectedDate) && a.status === 'completed').length, icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Icon size={13} />
                {label}
              </div>
              <span className="text-sm font-semibold text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── COLUMNA 2: Calendario de citas ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppointmentCalendar
          date={selectedDate}
          onDateChange={setSelectedDate}
          appointments={filteredAppts}
          staffList={staffList}
          activeStaff={activeStaff}
          loading={loading}
          onSlotClick={(slot) => { setSelectedSlot(slot); setShowNewAppt(true); }}
          onAppointmentClick={() => {}}
          onRefresh={refresh}
        />
      </div>

      {/* ── COLUMNA 3: Sala de espera ── */}
      <div className="w-64 bg-white border-l border-gray-200 flex flex-col shrink-0">
        <WaitingRoom
          waitingList={waitingList}
          staffList={staffList}
          onUpdate={refresh}
        />
      </div>

      {/* ── Botón flotante nueva cita ── */}
      <button
        onClick={() => { setSelectedSlot(null); setShowNewAppt(true); }}
        className="fixed bottom-6 right-72 w-12 h-12 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95">
        <Plus size={22} />
      </button>

      {/* ── Modales ── */}
      {showNewAppt && (
        <NewAppointmentModal
          slot={selectedSlot}
          staffList={staffList}
          branchId={branchId}
          organizationId={organizationId}
          onClose={() => { setShowNewAppt(false); setSelectedSlot(null); }}
          onCreated={refresh}
        />
      )}

      {showCommissions && (
        <StaffCommissions
          staffList={staffList}
          branchId={branchId}
          onClose={() => setShowCommissions(false)}
        />
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 2: AppointmentCalendar — Calendario semanal de citas
// =============================================================================

function AppointmentCalendar({ date, onDateChange, appointments, staffList, activeStaff, loading, onSlotClick, onAppointmentClick, onRefresh }) {
  const weekStart  = startOfWeek(date, { weekStartsOn: 1 }); // Lunes
  const weekDays   = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours      = Array.from({ length: 13 }, (_, i) => i + 8); // 8am - 8pm

  // Colores por estilista
  const staffColors = ['bg-blue-100 border-blue-300 text-blue-800',
    'bg-purple-100 border-purple-300 text-purple-800',
    'bg-green-100 border-green-300 text-green-800',
    'bg-amber-100 border-amber-300 text-amber-800',
    'bg-pink-100 border-pink-300 text-pink-800'];

  const staffColorMap = Object.fromEntries(
    staffList.map((s, i) => [s.id, staffColors[i % staffColors.length]])
  );

  function getApptStyle(appt) {
    const start  = parseISO(appt.start_at);
    const end    = parseISO(appt.end_at);
    const topMin = (start.getHours() - 8) * 60 + start.getMinutes();
    const height = differenceInMinutes(end, start);
    return { top: `${topMin}px`, height: `${Math.max(height, 30)}px` };
  }

  const statusStyles = {
    scheduled:  'opacity-80',
    confirmed:  '',
    arrived:    'ring-2 ring-amber-400',
    in_service: 'ring-2 ring-brand-400',
    completed:  'opacity-50 line-through',
    cancelled:  'opacity-30 line-through',
    no_show:    'opacity-30',
  };

  const statusLabels = {
    scheduled:  '📅 Agendada',
    confirmed:  '✅ Confirmada',
    arrived:    '🟡 Llegó',
    in_service: '✂️ En servicio',
    completed:  '✔ Completada',
    cancelled:  '✖ Cancelada',
    no_show:    '👻 No asistió',
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Navegación semana ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <button onClick={() => onDateChange(addDays(date, -7))} className="p-1.5 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={18} />
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {format(weekStart, "d 'de' MMMM", { locale: es })} –{' '}
            {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", { locale: es })}
          </h2>
          <button
            onClick={() => onDateChange(new Date())}
            className="text-xs text-brand-600 hover:underline">
            Hoy
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => onDateChange(addDays(date, 7))} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Cabecera días ── */}
      <div className="grid grid-cols-[48px_repeat(7,1fr)] bg-white border-b border-gray-200">
        <div /> {/* Columna de horas */}
        {weekDays.map(day => {
          const isToday = isSameDay(day, new Date());
          const isSelected = isSameDay(day, date);
          return (
            <div
              key={day.toISOString()}
              onClick={() => onDateChange(day)}
              className={`text-center py-2 cursor-pointer transition-colors ${
                isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
              }`}>
              <p className={`text-[10px] uppercase tracking-wide ${isToday ? 'text-brand-600 font-bold' : 'text-gray-400'}`}>
                {format(day, 'EEE', { locale: es })}
              </p>
              <p className={`text-lg font-semibold mt-0.5 w-8 h-8 rounded-full mx-auto flex items-center justify-center ${
                isToday ? 'bg-brand-600 text-white' : 'text-gray-900'
              }`}>
                {format(day, 'd')}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Grid de horas ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[48px_repeat(7,1fr)] relative">
          {/* Columna de horas */}
          <div>
            {hours.map(h => (
              <div key={h} className="h-[60px] border-b border-gray-100 flex items-start justify-end pr-2 pt-1">
                <span className="text-[10px] text-gray-400">{h}:00</span>
              </div>
            ))}
          </div>

          {/* Columnas por día */}
          {weekDays.map(day => {
            const dayAppts = appointments.filter(a =>
              isSameDay(parseISO(a.start_at), day)
            );

            return (
              <div key={day.toISOString()} className="relative border-l border-gray-100">
                {/* Grid de horas clickeable */}
                {hours.map(h => (
                  <div
                    key={h}
                    onClick={() => onSlotClick({ date: day, time: `${h}:00`, staffId: activeStaff })}
                    className="h-[60px] border-b border-gray-100 hover:bg-brand-50/30 cursor-pointer transition-colors group">
                    <div className="opacity-0 group-hover:opacity-100 text-[10px] text-brand-400 px-1 pt-1 transition-opacity">
                      + nueva cita
                    </div>
                  </div>
                ))}

                {/* Citas del día (posicionadas absolutamente) */}
                {dayAppts.map(appt => {
                  const color = staffColorMap[appt.staff_user_id] || 'bg-gray-100 border-gray-300 text-gray-800';
                  return (
                    <div
                      key={appt.id}
                      onClick={e => { e.stopPropagation(); onAppointmentClick(appt); }}
                      style={getApptStyle(appt)}
                      className={`absolute left-0.5 right-0.5 rounded-lg border px-1.5 py-1 text-[11px] cursor-pointer z-10 overflow-hidden transition-all hover:shadow-md ${color} ${statusStyles[appt.status] || ''}`}>
                      <p className="font-semibold truncate leading-tight">
                        {appt.customers?.name || 'Sin nombre'}
                      </p>
                      <p className="truncate opacity-70">
                        {appt.services?.[0]?.name || 'Servicio'}
                      </p>
                      {appt.status !== 'scheduled' && (
                        <span className="text-[9px] opacity-80 block">
                          {statusLabels[appt.status]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 3: WaitingRoom — Sala de espera en tiempo real
// Supabase Realtime: escucha cambios en tabla appointments
// =============================================================================

function WaitingRoom({ waitingList, staffList, onUpdate }) {
  async function updateStatus(apptId, newStatus) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', apptId);

    if (error) { toast.error('Error al actualizar'); return; }
    onUpdate();

    const msgs = {
      arrived:    '✅ Cliente marcado como llegado',
      in_service: '✂️ Servicio iniciado',
      completed:  '🎉 Servicio completado',
      no_show:    '⚠️ Marcado como no asistió',
    };
    toast.success(msgs[newStatus] || 'Actualizado');
  }

  async function sendWhatsAppReminder(appt) {
    const msg = encodeURIComponent(
      `Hola ${appt.customers?.name}, te recordamos tu cita para hoy a las ` +
      `${format(parseISO(appt.start_at), 'h:mm a')} con ${
        staffList.find(s => s.id === appt.staff_user_id)?.full_name || 'nuestro equipo'
      }. ¡Te esperamos! 💈`
    );
    const phone = appt.customers?.whatsapp?.replace(/\D/g, '');
    if (phone) window.open(`https://wa.me/57${phone}?text=${msg}`, '_blank');
    else toast.error('Cliente sin número de WhatsApp');
  }

  const waitingStatuses = ['scheduled', 'confirmed', 'arrived', 'in_service'];
  const queue = waitingList.filter(a => waitingStatuses.includes(a.status))
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Timer size={16} className="text-amber-500" />
          Sala de espera
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">{queue.length} en cola · actualiza en tiempo real</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {queue.length === 0 ? (
          <div className="text-center py-10 text-gray-300">
            <Timer size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-xs">Sin clientes en espera</p>
          </div>
        ) : queue.map((appt, idx) => {
          const staff = staffList.find(s => s.id === appt.staff_user_id);
          const startTime = format(parseISO(appt.start_at), 'h:mm a');
          const isNow = appt.status === 'in_service';
          const isNext = appt.status === 'arrived';
          const minUntil = differenceInMinutes(parseISO(appt.start_at), new Date());

          return (
            <div key={appt.id}
              className={`rounded-2xl p-3 border transition-all ${
                isNow  ? 'bg-brand-50 border-brand-200' :
                isNext ? 'bg-amber-50 border-amber-200' :
                         'bg-gray-50 border-gray-200'
              }`}>

              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isNow ? 'bg-brand-600 text-white' : 'bg-gray-300 text-gray-700'
                  }`}>
                    {idx + 1}
                  </div>
                  <span className={`text-xs font-semibold ${isNow ? 'text-brand-700' : 'text-gray-700'}`}>
                    {appt.customers?.name || 'Sin nombre'}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400">{startTime}</span>
              </div>

              {/* Servicio y estilista */}
              <p className="text-[11px] text-gray-600 mb-1 truncate">
                {appt.services?.[0]?.name || 'Sin servicio'} · {staff?.full_name?.split(' ')[0] || '—'}
              </p>

              {/* Tiempo restante / estado */}
              <div className="flex items-center gap-1 mb-2">
                {isNow ? (
                  <span className="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">✂️ En servicio</span>
                ) : isNext ? (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">🟡 Llegó — esperando</span>
                ) : minUntil > 0 ? (
                  <span className="text-[10px] text-gray-400">En {minUntil} min</span>
                ) : (
                  <span className="text-[10px] text-red-400">⚠️ {Math.abs(minUntil)} min de retraso</span>
                )}
              </div>

              {/* Acciones por estado */}
              <div className="flex gap-1.5 flex-wrap">
                {appt.status === 'scheduled' && (
                  <>
                    <button
                      onClick={() => updateStatus(appt.id, 'arrived')}
                      className="flex-1 text-[10px] py-1 bg-amber-500 text-white rounded-lg font-medium">
                      Llegó
                    </button>
                    <button
                      onClick={() => sendWhatsAppReminder(appt)}
                      className="text-[10px] px-2 py-1 bg-green-100 text-green-700 rounded-lg">
                      <MessageCircle size={11} />
                    </button>
                    <button
                      onClick={() => updateStatus(appt.id, 'no_show')}
                      className="text-[10px] px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">
                      <XCircle size={11} />
                    </button>
                  </>
                )}
                {appt.status === 'confirmed' && (
                  <button
                    onClick={() => updateStatus(appt.id, 'arrived')}
                    className="w-full text-[10px] py-1.5 bg-amber-500 text-white rounded-lg font-medium">
                    ✅ Confirmar llegada
                  </button>
                )}
                {appt.status === 'arrived' && (
                  <button
                    onClick={() => updateStatus(appt.id, 'in_service')}
                    className="w-full text-[10px] py-1.5 bg-brand-600 text-white rounded-lg font-medium">
                    ✂️ Iniciar servicio
                  </button>
                )}
                {appt.status === 'in_service' && (
                  <button
                    onClick={() => updateStatus(appt.id, 'completed')}
                    className="w-full text-[10px] py-1.5 bg-green-600 text-white rounded-lg font-medium">
                    ✔ Completar y cobrar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 4: NewAppointmentModal — Crear nueva cita
// =============================================================================

function NewAppointmentModal({ slot, staffList, branchId, organizationId, onClose, onCreated }) {
  const [form, setForm] = useState({
    customer_search: '',
    customer_id:     null,
    staff_user_id:   slot?.staffId || staffList[0]?.id || '',
    date:            slot?.date ? format(slot.date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    start_time:      slot?.time || '09:00',
    services:        [],
    notes:           '',
  });
  const [customerResults, setCustomerResults] = useState([]);
  const [serviceOptions,  setServiceOptions]  = useState([]);
  const [saving, setSaving] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [quickPhone, setQuickPhone] = useState('');
  const [searchDone, setSearchDone] = useState(false);

  // Cargar servicios
  useEffect(() => {
    supabase.from('products')
      .select('id, name, price, metadata')
      .eq('organization_id', organizationId)
      .eq('item_type', 'service')
      .eq('is_active', true)
      .then(({ data }) => setServiceOptions(data || []));
  }, [organizationId]);

  // Buscar clientes
  useEffect(() => {
    const q = form.customer_search;
    if (q.length < 2) { setCustomerResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('customers')
        .select('id, name, phone')
        .eq('organization_id', organizationId)
        .or(`name.ilike.%${q}%,phone.like.%${q}%`)
        .limit(5);
      setCustomerResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [form.customer_search, organizationId]);

  function toggleService(service) {
    setForm(f => {
      const exists = f.services.find(s => s.product_id === service.id);
      const duration = service.metadata?.duration_minutes || 30;
      if (exists) {
        return { ...f, services: f.services.filter(s => s.product_id !== service.id) };
      }
      return { ...f, services: [...f.services, { product_id: service.id, name: service.name, price: service.price, duration_minutes: duration }] };
    });
  }

  // Calcular hora fin basada en la duración total de los servicios
  const totalDuration = form.services.reduce((s, svc) => s + (svc.duration_minutes || 30), 0);
  const [startH, startM] = form.start_time.split(':').map(Number);
  const endDate = new Date(2000, 0, 1, startH, startM + totalDuration);
  const endTime = `${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}`;

  const totalPrice = form.services.reduce((s, svc) => s + svc.price, 0);

  // Crear cliente rápido desde el modal sin salir de la cita
  async function handleQuickCreateCustomer() {
    const name = form.customer_search.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('customers').insert({
        organization_id: organizationId,
        name,
        phone: quickPhone.trim() || null,
      }).select('id, name').single();
      if (error) throw error;
      setForm(f => ({ ...f, customer_id: data.id, customer_search: data.name }));
      setCreatingCustomer(false);
      setQuickPhone('');
      toast.success(`Cliente "${name}" creado`);
    } catch (err) {
      toast.error(err.message || 'Error al crear cliente');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    // Cliente es opcional — se permite walk-in sin registro
    if (!form.staff_user_id)    { toast.error('Asigna un estilista'); return; }
    if (!form.services.length)  { toast.error('Agrega al menos un servicio'); return; }

    setSaving(true);
    try {
      const startAt = `${form.date}T${form.start_time}:00-05:00`;
      const endAt   = `${form.date}T${endTime}:00-05:00`;

      // Walk-in: guardar nombre en notas si no hay cliente registrado
      const walkInNote = !form.customer_id && form.customer_search.trim()
        ? `[Walk-in: ${form.customer_search.trim()}] `
        : '';

      const { error } = await supabase.from('appointments').insert({
        branch_id:     branchId,
        customer_id:   form.customer_id || null,
        staff_user_id: form.staff_user_id,
        start_at:      startAt,
        end_at:        endAt,
        status:        'scheduled',
        services:      form.services,
        notes:         walkInNote + (form.notes || ''),
      });

      if (error) throw error;
      toast.success('Cita agendada correctamente');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Error al guardar la cita');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Plus size={18} className="text-brand-600" />
            Nueva cita
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Búsqueda de cliente */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Cliente</label>
            {form.customer_id ? (
              <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
                <User size={14} className="text-brand-600" />
                <span className="text-sm text-brand-800 flex-1">{form.customer_search}</span>
                <button onClick={() => setForm(f => ({ ...f, customer_id: null, customer_search: '' }))} className="text-brand-400 hover:text-brand-600">✕</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={form.customer_search}
                  onChange={e => {
                    setForm(f => ({ ...f, customer_search: e.target.value }));
                    setCreatingCustomer(false);
                    setSearchDone(false);
                  }}
                  onBlur={() => setTimeout(() => setSearchDone(true), 200)}
                  placeholder="Buscar nombre o teléfono... (opcional)"
                  className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                />

                {/* Resultados de búsqueda */}
                {customerResults.length > 0 && (
                  <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    {customerResults.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setForm(f => ({
                          ...f,
                          customer_id:     c.id,
                          customer_search: c.name,
                        }))}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                        <User size={13} className="text-gray-400" />
                        <span>{c.name}</span>
                        <span className="text-gray-400 text-xs ml-auto">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Crear cliente nuevo si no hay resultados */}
                {form.customer_search.trim().length >= 2 && customerResults.length === 0 && (
                  <div className="mt-1 bg-white border border-dashed border-brand-300 rounded-xl overflow-hidden">
                    {!creatingCustomer ? (
                      <button
                        onClick={() => setCreatingCustomer(true)}
                        className="w-full text-left px-3 py-2 hover:bg-brand-50 text-sm flex items-center gap-2 text-brand-700">
                        <Plus size={13} className="text-brand-500" />
                        Crear cliente <strong>"{form.customer_search.trim()}"</strong>
                      </button>
                    ) : (
                      <div className="p-3 space-y-2">
                        <p className="text-xs font-medium text-brand-700">Nuevo cliente: <strong>{form.customer_search.trim()}</strong></p>
                        <input
                          type="tel"
                          value={quickPhone}
                          onChange={e => setQuickPhone(e.target.value)}
                          placeholder="Teléfono (opcional)"
                          className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleQuickCreateCustomer}
                            disabled={saving}
                            className="flex-1 bg-brand-600 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50">
                            {saving ? 'Creando...' : 'Crear y seleccionar'}
                          </button>
                          <button
                            onClick={() => setCreatingCustomer(false)}
                            className="px-3 text-gray-400 hover:text-gray-600 text-xs">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Walk-in sin datos */}
                {!form.customer_search.trim() && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    Déjalo vacío para atender sin registro (walk-in)
                  </p>
                )}
              </>
            )}
          </div>

          {/* Fecha y hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Fecha</label>
              <input type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Hora inicio</label>
              <input type="time" value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          </div>

          {/* Estilista */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Estilista</label>
            <div className="flex gap-2 flex-wrap">
              {staffList.map(staff => (
                <button
                  key={staff.id}
                  onClick={() => setForm(f => ({ ...f, staff_user_id: staff.id }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    form.staff_user_id === staff.id
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-brand-300'
                  }`}>
                  {staff.full_name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Servicios */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Servicios</label>
            <div className="grid grid-cols-2 gap-2">
              {serviceOptions.map(svc => {
                const selected = form.services.some(s => s.product_id === svc.id);
                return (
                  <button
                    key={svc.id}
                    onClick={() => toggleService(svc)}
                    className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                      selected ? 'bg-brand-50 border-brand-300 text-brand-800' : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-brand-200'
                    }`}>
                    <div className="font-medium">{svc.name}</div>
                    <div className="text-gray-400 mt-0.5">
                      {formatCOP(svc.price)} · {svc.metadata?.duration_minutes || 30} min
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Notas (opcional)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Preferencias del cliente, estilo, color..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400 resize-none"
            />
          </div>

          {/* Resumen */}
          {form.services.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>Duración total</span>
                <span>{totalDuration} min · hasta {endTime}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900">
                <span>Total</span>
                <span>{formatCOP(totalPrice)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {saving ? 'Guardando...' : 'Agendar cita'}
          </button>
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 5: StaffCommissions — Reporte de comisiones
// =============================================================================

function StaffCommissions({ staffList, branchId, onClose }) {
  const [period, setPeriod]   = useState('week');  // 'day' | 'week' | 'month'
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, [period, branchId]);

  async function load() {
    setLoading(true);
    const now  = new Date();
    const from = period === 'day'   ? new Date(now.setHours(0,0,0,0))
               : period === 'week'  ? startOfWeek(now, { weekStartsOn: 1 })
               : new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: orders } = await supabase
      .from('orders')
      .select('total, staff_user_id, order_items(product_id, quantity, subtotal, staff_user_id)')
      .eq('branch_id', branchId)
      .eq('status', 'paid')
      .gte('created_at', from.toISOString());

    // Calcular comisión por estilista (BACKEND math)
    const commissionMap = {};
    for (const staff of staffList) {
      commissionMap[staff.id] = {
        ...staff,
        services_count: 0,
        total_revenue:  0,
        commission_earned: 0,
      };
    }

    for (const order of orders || []) {
      for (const item of order.order_items || []) {
        const staffId = item.staff_user_id || order.staff_user_id;
        if (commissionMap[staffId]) {
          const staff = staffList.find(s => s.id === staffId);
          commissionMap[staffId].services_count++;
          commissionMap[staffId].total_revenue  += item.subtotal;
          commissionMap[staffId].commission_earned += Math.round(item.subtotal * (staff?.commission_pct || 0) / 100);
        }
      }
    }

    setData(Object.values(commissionMap).sort((a,b) => b.total_revenue - a.total_revenue));
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign size={18} className="text-brand-600" />
            Comisiones por estilista
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Selector de período */}
        <div className="flex gap-2 p-4 border-b border-gray-100">
          {[['day','Hoy'],['week','Esta semana'],['month','Este mes']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPeriod(val)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                period === val ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
              Calculando...
            </div>
          ) : data.map(staff => (
            <div key={staff.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold shrink-0">
                {staff.full_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{staff.full_name}</p>
                <p className="text-xs text-gray-400">
                  {staff.services_count} servicios · {staff.commission_pct}% comisión
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">{formatCOP(staff.commission_earned)}</p>
                <p className="text-[10px] text-gray-400">{formatCOP(staff.total_revenue)} facturado</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-400">
            Total comisiones: <strong className="text-gray-700">
              {formatCOP(data.reduce((s, d) => s + d.commission_earned, 0))}
            </strong>
          </span>
          <button onClick={load} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            <RefreshCw size={11} /> Actualizar
          </button>
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 6: useAppointments — Hook con Supabase Realtime
// =============================================================================

export function useAppointments(branchId, date) {
  const [appointments, setAppointments] = useState([]);
  const [loading,      setLoading]      = useState(false);

  async function load() {
    if (!branchId) return;
    setLoading(true);
    // Cargar toda la semana visible (lunes a domingo)
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const weekEnd   = addDays(weekStart, 6);
    const startStr  = format(weekStart, 'yyyy-MM-dd');
    const endStr    = format(weekEnd,   'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customers(id, name, phone),
        users!staff_user_id(id, full_name)
      `)
      .eq('branch_id', branchId)
      .gte('start_at', `${startStr}T00:00:00-05:00`)
      .lte('start_at', `${endStr}T23:59:59-05:00`)
      .order('start_at');

    if (!error) setAppointments(data || []);
    setLoading(false);
  }

  // Recargar al montar y cuando cambia la semana (no cada día para evitar doble fetch)
  useEffect(() => { load(); }, [branchId, startOfWeek(date, { weekStartsOn: 1 })?.toDateString()]);

  // Suscripción Realtime para la sala de espera
  useEffect(() => {
    if (!branchId) return;

    const channel = supabase
      .channel(`appointments:${branchId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'appointments',
        filter: `branch_id=eq.${branchId}`,
      }, (payload) => {
        // Actualizar la lista en tiempo real sin recargar todo
        if (payload.eventType === 'INSERT') {
          load(); // Necesitamos el JOIN con customers
        } else if (payload.eventType === 'UPDATE') {
          setAppointments(prev =>
            prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a)
          );
        } else if (payload.eventType === 'DELETE') {
          setAppointments(prev => prev.filter(a => a.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [branchId]);

  // Separar lista de espera (hoy)
  const waitingList = appointments.filter(a =>
    isSameDay(parseISO(a.start_at), new Date())
  );

  return { appointments, waitingList, loading, refresh: load };
}
