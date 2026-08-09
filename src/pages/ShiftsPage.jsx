// =============================================================================
// FERZU POS — ShiftsPage.jsx
// F3: Módulo de turnos y asistencia (reloj checador)
// Empleado: clock-in/out + descanso + historial propio
// Admin: resumen de horas por empleado + historial completo
// =============================================================================
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Clock, LogIn, LogOut, Coffee, RefreshCw,
  Users, Calendar, Timer, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO, differenceInMinutes, differenceInSeconds } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { usePOS } from '../context/POSContext.jsx'
import { useNavigate } from 'react-router-dom'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCOP(n) {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function minutesToHHMM(mins) {
  if (!mins && mins !== 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── Cronómetro en vivo ───────────────────────────────────────────────────────
function LiveTimer({ since, isBreak }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(differenceInSeconds(new Date(), new Date(since)));
    }, 1000);
    return () => clearInterval(t);
  }, [since]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  return (
    <div className={`text-center ${isBreak ? 'text-amber-600' : 'text-brand-600'}`}>
      <p className="text-5xl font-black tabular-nums tracking-tight">
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </p>
      <p className="text-xs font-medium mt-1 opacity-60">
        {isBreak ? 'Tiempo en descanso' : 'Tiempo trabajado'}
      </p>
    </div>
  );
}

// ─── Tarjeta de turno en historial ───────────────────────────────────────────
function ShiftRow({ shift, showUser }) {
  const [open, setOpen] = useState(false);
  const isOpen = !shift.clock_out;

  const duration = shift.clock_out
    ? minutesToHHMM(shift.total_minutes)
    : '• En curso';

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
          isOpen ? 'bg-brand-50' : 'bg-white'
        }`}>
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOpen ? 'bg-brand-500 animate-pulse' : 'bg-gray-300'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {showUser && (
              <span className="text-xs font-bold text-gray-700">{shift.users?.full_name || 'Usuario'}</span>
            )}
            <span className="text-xs text-gray-500">
              {format(parseISO(shift.clock_in), "dd/MM/yyyy · HH:mm", { locale: es })}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">
            {isOpen ? '🟢 Turno activo' : duration}
            {shift.break_minutes > 0 && !isOpen && (
              <span className="text-xs text-amber-600 ml-2 font-normal">
                (descanso {minutesToHHMM(shift.break_minutes)})
              </span>
            )}
          </p>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-3 bg-white grid grid-cols-2 gap-3 text-xs text-gray-600">
          <div>
            <p className="font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Entrada</p>
            <p>{format(parseISO(shift.clock_in), "HH:mm:ss")}</p>
          </div>
          {shift.clock_out && (
            <div>
              <p className="font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Salida</p>
              <p>{format(parseISO(shift.clock_out), "HH:mm:ss")}</p>
            </div>
          )}
          {shift.break_start && (
            <div>
              <p className="font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Descanso</p>
              <p>
                {format(parseISO(shift.break_start), "HH:mm")}
                {shift.break_end ? ` → ${format(parseISO(shift.break_end), "HH:mm")}` : ' (en curso)'}
              </p>
            </div>
          )}
          {shift.notes && (
            <div className="col-span-2">
              <p className="font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Nota</p>
              <p className="italic">{shift.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Vista admin: resumen de horas ───────────────────────────────────────────
function AdminSummary({ branchId }) {
  const [summary,  setSummary]  = useState([]);
  const [date,     setDate]     = useState(todayStr());
  const [loading,  setLoading]  = useState(false);
  const [shifts,   setShifts]   = useState([]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [sumRes, shiftsRes] = await Promise.all([
        api.get(`/shifts/summary?branch_id=${branchId}&date_from=${date}&date_to=${date}`),
        api.get(`/shifts?branch_id=${branchId}&date=${date}&limit=100`),
      ]);
      setSummary(sumRes.data);
      setShifts(shiftsRes.data);
    } catch (e) {
      toast.error('Error cargando resumen');
    } finally {
      setLoading(false);
    }
  }, [branchId, date]);

  useEffect(() => { load(); }, [load]);

  const totalOrgMinutes = summary.reduce((s, u) => s + u.total_minutes, 0);

  return (
    <div className="space-y-5">
      {/* Selector de fecha */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</label>
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={e => setDate(e.target.value)}
          className="h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-brand-400"
        />
        <button onClick={load} disabled={loading} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw size={14} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <span className="ml-auto text-xs text-gray-400">
          Total org: <strong className="text-gray-700">{minutesToHHMM(totalOrgMinutes)}</strong>
        </span>
      </div>

      {/* Tabla resumen por empleado */}
      {summary.length === 0 && !loading ? (
        <div className="text-center py-8 text-gray-400">
          <Users size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin registros de asistencia este día</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Horas trabajadas por empleado</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-5 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Empleado</th>
                <th className="px-3 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold text-right">Turnos</th>
                <th className="px-3 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold text-right">Descanso</th>
                <th className="px-5 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold text-right">Horas netas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {summary.map(u => (
                <tr key={u.user_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold text-gray-800">{u.full_name}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{u.role}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-gray-600">{u.shifts_count}</td>
                  <td className="px-3 py-3 text-right text-xs text-amber-600">
                    {u.break_minutes > 0 ? minutesToHHMM(u.break_minutes) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-sm font-bold text-gray-900">{minutesToHHMM(u.total_minutes)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle de turnos del día */}
      {shifts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Detalle de turnos</h3>
          {shifts.map(s => <ShiftRow key={s.id} shift={s} showUser />)}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ShiftsPage() {
  const { user }  = useAuth();
  const { branchId } = usePOS();
  const navigate  = useNavigate();
  const isAdmin   = ['admin', 'owner'].includes(user?.role);

  const [activeShift,  setActiveShift]  = useState(null);   // turno activo (null = sin turno)
  const [loadingShift, setLoadingShift] = useState(true);
  const [history,      setHistory]      = useState([]);
  const [loadingHist,  setLoadingHist]  = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab,          setTab]          = useState('clock'); // 'clock' | 'history' | 'admin'

  const onBreak = activeShift?.break_start && !activeShift?.break_end;

  // ─── Cargar turno activo ──────────────────────────────────────────────────
  const loadActive = useCallback(async () => {
    setLoadingShift(true);
    try {
      const { data } = await api.get('/shifts/active');
      setActiveShift(data);
    } catch {
      setActiveShift(null);
    } finally {
      setLoadingShift(false);
    }
  }, []);

  // ─── Cargar historial propio ──────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHist(true);
    try {
      const { data } = await api.get('/shifts?limit=30');
      setHistory(data);
    } catch {
      toast.error('Error cargando historial');
    } finally {
      setLoadingHist(false);
    }
  }, []);

  useEffect(() => { loadActive(); }, [loadActive]);
  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // ─── Acciones de reloj ───────────────────────────────────────────────────
  async function handleClockIn() {
    if (!branchId) { toast.error('Selecciona una sucursal primero'); return; }
    setActionLoading(true);
    try {
      const { data } = await api.post('/shifts/clock-in', { branch_id: branchId });
      setActiveShift(data);
      toast.success('¡Entrada registrada!');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al registrar entrada');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClockOut() {
    setActionLoading(true);
    try {
      const { data } = await api.post('/shifts/clock-out');
      setActiveShift(null);
      setHistory(prev => [data, ...prev]);
      toast.success(`Turno cerrado · ${minutesToHHMM(data.total_minutes)} trabajados`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al registrar salida');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBreakStart() {
    setActionLoading(true);
    try {
      const { data } = await api.post('/shifts/break-start');
      setActiveShift(data);
      toast('Descanso iniciado ☕', { icon: '☕' });
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBreakEnd() {
    setActionLoading(true);
    try {
      const { data } = await api.post('/shifts/break-end');
      setActiveShift(data);
      toast.success('¡De vuelta al trabajo!');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error');
    } finally {
      setActionLoading(false);
    }
  }

  // ─── Guard: sin sucursal activa no hay turno que registrar ──────────────────
  if (!branchId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 bg-gray-50 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
          <Clock size={32} className="text-amber-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Selecciona una sucursal</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xs">
            Para registrar tu turno necesitas abrir el POS y seleccionar la sucursal activa.
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

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Turnos y Asistencia</h1>
        <p className="text-sm text-gray-500 mt-0.5">Reloj checador · {user?.full_name}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[
          { key: 'clock',   label: 'Mi turno',    icon: Clock },
          { key: 'history', label: 'Mi historial', icon: Calendar },
          ...(isAdmin ? [{ key: 'admin', label: 'Equipo', icon: Users }] : []),
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === key
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Mi turno ── */}
      {tab === 'clock' && (
        <div className="space-y-4">
          {loadingShift ? (
            <div className="flex justify-center py-12">
              <RefreshCw size={22} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Cronómetro */}
              <div className={`rounded-3xl p-8 text-center border-2 transition-all ${
                activeShift
                  ? onBreak
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-brand-50 border-brand-200'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                {activeShift ? (
                  <>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4 ${
                      onBreak
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-brand-100 text-brand-700'
                    }`}>
                      <div className={`w-2 h-2 rounded-full animate-pulse ${onBreak ? 'bg-amber-500' : 'bg-brand-500'}`} />
                      {onBreak ? 'En descanso' : 'Turno activo'}
                    </div>
                    <LiveTimer
                      since={onBreak ? activeShift.break_start : activeShift.clock_in}
                      isBreak={onBreak}
                    />
                    <p className="text-xs text-gray-400 mt-3">
                      Entrada: {format(parseISO(activeShift.clock_in), "HH:mm · dd/MM/yyyy")}
                    </p>
                  </>
                ) : (
                  <div className="py-2">
                    <Clock size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-base font-semibold text-gray-500">Sin turno activo</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="grid grid-cols-2 gap-3">
                {!activeShift ? (
                  <button
                    onClick={handleClockIn}
                    disabled={actionLoading}
                    className="col-span-2 h-14 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-base shadow-lg shadow-brand-600/20 transition-all disabled:opacity-50">
                    {actionLoading ? <RefreshCw size={18} className="animate-spin" /> : <LogIn size={18} />}
                    Registrar entrada
                  </button>
                ) : (
                  <>
                    {!onBreak ? (
                      <button
                        onClick={handleBreakStart}
                        disabled={actionLoading}
                        className="h-12 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-2xl flex items-center justify-center gap-2 text-sm border-2 border-amber-200 transition-all disabled:opacity-50">
                        {actionLoading ? <RefreshCw size={15} className="animate-spin" /> : <Coffee size={15} />}
                        Iniciar descanso
                      </button>
                    ) : (
                      <button
                        onClick={handleBreakEnd}
                        disabled={actionLoading}
                        className="h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-sm transition-all disabled:opacity-50">
                        {actionLoading ? <RefreshCw size={15} className="animate-spin" /> : <Coffee size={15} />}
                        Volver al trabajo
                      </button>
                    )}
                    <button
                      onClick={handleClockOut}
                      disabled={actionLoading}
                      className="h-12 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-2xl flex items-center justify-center gap-2 text-sm border-2 border-red-200 transition-all disabled:opacity-50">
                      {actionLoading ? <RefreshCw size={15} className="animate-spin" /> : <LogOut size={15} />}
                      Registrar salida
                    </button>
                  </>
                )}
              </div>

              {/* Nota de horario */}
              {!branchId && (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  <AlertCircle size={14} />
                  Selecciona una sucursal para registrar tu turno
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Mi historial ── */}
      {tab === 'history' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Últimos 30 turnos</h3>
            <button onClick={loadHistory} disabled={loadingHist} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <RefreshCw size={13} className={`text-gray-400 ${loadingHist ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingHist ? (
            <div className="flex justify-center py-8">
              <RefreshCw size={20} className="animate-spin text-gray-400" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Timer size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin turnos registrados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(s => <ShiftRow key={s.id} shift={s} showUser={false} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Admin (Equipo) ── */}
      {tab === 'admin' && isAdmin && (
        <AdminSummary branchId={branchId} />
      )}
    </div>
  );
}
