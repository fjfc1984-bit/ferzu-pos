// =============================================================================
// FERZU POS — TablesPage.jsx
// F2: Editor visual de mesas (drag & drop)
// Solo admin/owner. Permite crear, editar, mover y eliminar mesas.
// =============================================================================
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Pencil, Trash2, RefreshCw, X, Check,
  Users, LayoutGrid, Armchair, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { usePOS } from '../context/POSContext.jsx'
import { useNavigate } from 'react-router-dom'

// ─── Constantes del grid ─────────────────────────────────────────────────────
const COLS      = 10   // columnas del mapa
const ROWS      = 8    // filas del mapa
const CELL_SIZE = 88   // px por celda (cuadrada)
const GAP       = 6    // px de gap entre celdas

// ─── Colores por área ────────────────────────────────────────────────────────
const AREA_COLORS = {
  'Salón':    { bg: 'bg-blue-100',   border: 'border-blue-300',   text: 'text-blue-800'   },
  'Terraza':  { bg: 'bg-green-100',  border: 'border-green-300',  text: 'text-green-800'  },
  'Bar':      { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-800' },
  'VIP':      { bg: 'bg-amber-100',  border: 'border-amber-300',  text: 'text-amber-800'  },
  'Exterior': { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800' },
};
const DEFAULT_AREA_COLOR = { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700' };

function areaColor(area) {
  return AREA_COLORS[area] || DEFAULT_AREA_COLOR;
}

// ─── Colores de estado ───────────────────────────────────────────────────────
const STATUS_META = {
  available: { label: 'Disponible', dot: 'bg-green-500'  },
  occupied:  { label: 'Ocupada',    dot: 'bg-red-500'    },
  reserved:  { label: 'Reservada',  dot: 'bg-amber-500'  },
  cleaning:  { label: 'Limpieza',   dot: 'bg-blue-400'   },
};

const AREAS = ['Salón', 'Terraza', 'Bar', 'VIP', 'Exterior'];

// ─── Modal de creación / edición ─────────────────────────────────────────────
function TableModal({ table, onSave, onClose }) {
  const isEdit = Boolean(table?.id);
  const [name,     setName]     = useState(table?.name     || '');
  const [capacity, setCapacity] = useState(table?.capacity || 4);
  const [area,     setArea]     = useState(table?.area     || 'Salón');
  const [saving,   setSaving]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), capacity: Number(capacity), area });
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar la mesa');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {isEdit ? 'Editar mesa' : 'Nueva mesa'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
              Nombre
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Mesa 1, Barra A, VIP 2…"
              maxLength={50}
              className="w-full h-11 px-3 border-2 border-gray-200 focus:border-brand-400 rounded-xl text-sm font-medium outline-none"
            />
          </div>

          {/* Capacidad */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
              Capacidad (personas)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCapacity(c => Math.max(1, Number(c) - 1))}
                className="w-10 h-10 rounded-xl border-2 border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-100 transition-colors">
                −
              </button>
              <span className="flex-1 text-center text-2xl font-bold text-gray-900">{capacity}</span>
              <button
                type="button"
                onClick={() => setCapacity(c => Math.min(50, Number(c) + 1))}
                className="w-10 h-10 rounded-xl border-2 border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-100 transition-colors">
                +
              </button>
            </div>
          </div>

          {/* Área */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
              Área / zona
            </label>
            <div className="flex flex-wrap gap-2">
              {AREAS.map(a => {
                const c = areaColor(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setArea(a)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                      area === a
                        ? `${c.bg} ${c.border} ${c.text}`
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-10 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {saving
                ? <RefreshCw size={14} className="animate-spin" />
                : <Check size={14} />}
              {isEdit ? 'Guardar cambios' : 'Crear mesa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tarjeta de mesa ─────────────────────────────────────────────────────────
function TableCard({ table, isSelected, onSelect, onDragStart, onEdit, onDelete }) {
  const c   = areaColor(table.area);
  const sm  = STATUS_META[table.status] || STATUS_META.available;

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, table)}
      onClick={() => onSelect(table)}
      className={`
        absolute cursor-grab active:cursor-grabbing select-none rounded-2xl border-2
        flex flex-col items-center justify-center gap-1 transition-all shadow-sm
        hover:shadow-md hover:-translate-y-0.5
        ${c.bg} ${isSelected ? 'border-brand-500 shadow-brand-200 shadow-lg scale-105' : c.border}
      `}
      style={{
        left:   table.position_x * (CELL_SIZE + GAP),
        top:    table.position_y * (CELL_SIZE + GAP),
        width:  CELL_SIZE,
        height: CELL_SIZE,
      }}>

      {/* Indicador de estado */}
      <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${sm.dot}`} title={sm.label} />

      {/* Ícono */}
      <Armchair size={22} className={`${c.text} opacity-60`} />

      {/* Nombre */}
      <p className={`text-xs font-bold leading-tight text-center px-1 ${c.text} max-w-full truncate`}>
        {table.name}
      </p>

      {/* Capacidad */}
      <div className={`flex items-center gap-0.5 ${c.text} opacity-70`}>
        <Users size={10} />
        <span className="text-[10px] font-semibold">{table.capacity}</span>
      </div>

      {/* Área badge */}
      <span className={`text-[9px] font-semibold uppercase tracking-wide ${c.text} opacity-50`}>
        {table.area}
      </span>

      {/* Botones de acción (hover) */}
      {isSelected && (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
          <button
            onClick={e => { e.stopPropagation(); onEdit(table); }}
            className="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors">
            <Pencil size={11} className="text-gray-600" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(table); }}
            className="w-6 h-6 bg-white border border-red-200 rounded-full flex items-center justify-center shadow-sm hover:bg-red-50 transition-colors">
            <Trash2 size={11} className="text-red-500" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TablesPage() {
  const { user }  = useAuth();
  const { branchId } = usePOS();
  const navigate  = useNavigate();
  const isAdmin   = ['admin', 'owner'].includes(user?.role);

  const [tables,       setTables]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [selected,     setSelected]     = useState(null);   // id de mesa seleccionada
  const [showModal,    setShowModal]    = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);   // null = crear, obj = editar
  const [deletePending, setDeletePending] = useState(null); // mesa a confirmar borrado
  const [filterArea,   setFilterArea]   = useState('Todas');
  const dragTable = useRef(null);

  // ─── Cargar mesas ───────────────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/tables?branch_id=${branchId}`);
      setTables(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error cargando mesas');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { loadTables(); }, [loadTables]);

  // ─── CRUD helpers ───────────────────────────────────────────────────────────
  async function handleCreate(fields) {
    // Encontrar primera celda libre
    const occupied = new Set(tables.map(t => `${t.position_x},${t.position_y}`));
    let px = 0, py = 0;
    outer: for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!occupied.has(`${col},${row}`)) { px = col; py = row; break outer; }
      }
    }
    const { data } = await api.post('/tables', { branch_id: branchId, ...fields, position_x: px, position_y: py });
    setTables(prev => [...prev, data]);
    toast.success(`Mesa "${data.name}" creada`);
  }

  async function handleEdit(fields) {
    const { data } = await api.patch(`/tables/${editTarget.id}`, fields);
    setTables(prev => prev.map(t => t.id === data.id ? data : t));
    toast.success('Mesa actualizada');
  }

  async function handleDelete(table) {
    await api.delete(`/tables/${table.id}`);
    setTables(prev => prev.filter(t => t.id !== table.id));
    setSelected(null);
    setDeletePending(null);
    toast.success(`Mesa "${table.name}" eliminada`);
  }

  async function moveTable(tableId, newX, newY) {
    // Comprobar colisión
    if (tables.some(t => t.id !== tableId && t.position_x === newX && t.position_y === newY)) return;
    // Optimistic update
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, position_x: newX, position_y: newY } : t));
    try {
      await api.patch(`/tables/${tableId}`, { position_x: newX, position_y: newY });
    } catch {
      toast.error('No se pudo guardar la posición');
      loadTables(); // revert
    }
  }

  // ─── Drag & drop handlers ───────────────────────────────────────────────────
  function handleDragStart(e, table) {
    dragTable.current = table;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, col, row) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e, col, row) {
    e.preventDefault();
    if (!dragTable.current) return;
    moveTable(dragTable.current.id, col, row);
    dragTable.current = null;
  }

  // ─── Áreas para filtro ──────────────────────────────────────────────────────
  const presentAreas = ['Todas', ...new Set(tables.map(t => t.area))];
  const visibleTables = filterArea === 'Todas'
    ? tables
    : tables.filter(t => t.area === filterArea);

  // ─── Guard: sin sucursal no hay mesas que gestionar ─────────────────────────
  if (!branchId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 bg-gray-50 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
          <LayoutGrid size={32} className="text-amber-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Selecciona una sucursal</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xs">
            Para gestionar las mesas necesitas abrir el POS y seleccionar la sucursal activa.
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
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mapa de mesas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Arrastra las mesas para reposicionarlas • {tables.length} mesa{tables.length !== 1 ? 's' : ''} registrada{tables.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadTables}
            disabled={loading}
            className="p-2 text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button
              onClick={() => { setEditTarget(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors">
              <Plus size={15} />
              Nueva mesa
            </button>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle size={15} />
          {error}
          <button onClick={loadTables} className="ml-auto underline text-xs">Reintentar</button>
        </div>
      )}

      {/* ── Leyenda de estado + filtro por área ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Estado legend */}
        <div className="flex items-center gap-4">
          {Object.entries(STATUS_META).map(([key, { label, dot }]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${dot}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Filtro área */}
        <div className="flex items-center gap-1.5">
          {presentAreas.map(a => {
            const c = a === 'Todas' ? null : areaColor(a);
            return (
              <button
                key={a}
                onClick={() => setFilterArea(a)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                  filterArea === a
                    ? a === 'Todas'
                      ? 'bg-gray-800 text-white border-gray-800'
                      : `${c.bg} ${c.border} ${c.text}`
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {a}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Mapa visual (drag & drop grid) ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 overflow-auto">
        {loading && tables.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <RefreshCw size={24} className="animate-spin mr-2" />
            Cargando mesas…
          </div>
        ) : (
          <div
            className="relative"
            style={{
              width:  COLS * (CELL_SIZE + GAP) - GAP,
              height: ROWS * (CELL_SIZE + GAP) - GAP,
              minWidth: '100%',
            }}
            onClick={() => setSelected(null)}>

            {/* Celdas del grid (drop targets) */}
            {Array.from({ length: ROWS }, (_, row) =>
              Array.from({ length: COLS }, (_, col) => {
                const occupied = visibleTables.some(t => t.position_x === col && t.position_y === row);
                return (
                  <div
                    key={`${col}-${row}`}
                    onDragOver={e => handleDragOver(e, col, row)}
                    onDrop={e => handleDrop(e, col, row)}
                    className={`absolute rounded-xl transition-colors ${
                      occupied ? '' : 'bg-gray-50 hover:bg-brand-50 border border-dashed border-gray-200 hover:border-brand-200'
                    }`}
                    style={{
                      left:   col * (CELL_SIZE + GAP),
                      top:    row * (CELL_SIZE + GAP),
                      width:  CELL_SIZE,
                      height: CELL_SIZE,
                    }}
                  />
                );
              })
            )}

            {/* Mesas */}
            {visibleTables.map(table => (
              <TableCard
                key={table.id}
                table={table}
                isSelected={selected === table.id}
                onSelect={t => setSelected(prev => prev === t.id ? null : t.id)}
                onDragStart={handleDragStart}
                onEdit={t => { setEditTarget(t); setShowModal(true); }}
                onDelete={t => setDeletePending(t)}
              />
            ))}

            {/* Estado vacío */}
            {tables.length === 0 && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none">
                <Armchair size={40} className="mb-3 opacity-20" />
                <p className="text-sm font-medium">Sin mesas registradas</p>
                {isAdmin && (
                  <p className="text-xs mt-1">Haz clic en "Nueva mesa" para agregar la primera</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabla resumen (lista compacta) ── */}
      {tables.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Resumen de mesas</h3>
            <span className="text-xs text-gray-400">{tables.length} total · {tables.filter(t => t.status === 'available').length} disponibles</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="px-5 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Mesa</th>
                  <th className="px-3 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Área</th>
                  <th className="px-3 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold text-center">Cap.</th>
                  <th className="px-3 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Estado</th>
                  <th className="px-3 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold text-center">Pos.</th>
                  {isAdmin && <th className="px-5 py-2.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...tables].sort((a, b) => a.name.localeCompare(b.name)).map(t => {
                  const c  = areaColor(t.area);
                  const sm = STATUS_META[t.status] || STATUS_META.available;
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{t.area}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
                          <Users size={12} />
                          {t.capacity}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${sm.dot}`} />
                          <span className="text-xs text-gray-600">{sm.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-[10px] text-gray-400 font-mono">({t.position_x},{t.position_y})</span>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setEditTarget(t); setShowModal(true); }}
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700">
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => setDeletePending(t)}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal crear / editar ── */}
      {showModal && (
        <TableModal
          table={editTarget}
          onSave={editTarget ? handleEdit : handleCreate}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}

      {/* ── Confirm delete ── */}
      {deletePending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">¿Eliminar mesa?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Se eliminará <strong>"{deletePending.name}"</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletePending(null)}
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deletePending)}
                className="flex-1 h-10 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
