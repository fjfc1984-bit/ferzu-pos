// =============================================================================
// FERZU POS — BranchesPage
// Gestión de sucursales con niche por tipo de negocio.
// Plan Pro/Enterprise: múltiples branches, cada una con su propio niche,
// productos y categorías independientes.
// =============================================================================

import { useState, useEffect } from 'react'
import {
  Building2, Plus, Edit2, CheckCircle2, Scissors,
  UtensilsCrossed, Wrench, ShoppingCart, Store,
  MapPin, Users, Save, X, ChevronRight, Zap
} from 'lucide-react'
import { supabase }     from '../lib/supabase.js'
import { useAuth }      from '../context/AuthContext.jsx'
import { usePOS }       from '../context/POSContext.jsx'
import { NICHE_LABELS } from '../hooks/useBranchNiche.js'
import toast            from 'react-hot-toast'

// ── Configuración visual de niches ───────────────────────────────────────────
const NICHE_CONFIG = {
  general:    { label: 'General',          icon: Store,           color: 'bg-gray-100 text-gray-700',     ring: 'ring-gray-400' },
  barbershop: { label: 'Barbería / Spa',   icon: Scissors,        color: 'bg-purple-100 text-purple-700', ring: 'ring-purple-400' },
  restaurant: { label: 'Restaurante',      icon: UtensilsCrossed, color: 'bg-orange-100 text-orange-700', ring: 'ring-orange-400' },
  workshop:   { label: 'Taller',           icon: Wrench,          color: 'bg-yellow-100 text-yellow-700', ring: 'ring-yellow-400' },
  minimarket: { label: 'Minimarket',       icon: ShoppingCart,    color: 'bg-green-100 text-green-700',   ring: 'ring-green-400' },
}

// ── Modal crear/editar branch ─────────────────────────────────────────────────
function BranchModal({ branch, organizationId, onSave, onClose }) {
  const isEdit = !!branch?.id
  const [form, setForm] = useState({
    name:    branch?.name    || '',
    address: branch?.address || '',
    niche:   branch?.niche   || 'general',
    phone:   branch?.phone   || '',
  })
  const [saving, setSaving] = useState(false)

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    try {
      let error
      if (isEdit) {
        ({ error } = await supabase
          .from('branches')
          .update({ name: form.name.trim(), address: form.address, niche: form.niche, phone: form.phone })
          .eq('id', branch.id)
          .eq('organization_id', organizationId))
      } else {
        ({ error } = await supabase
          .from('branches')
          .insert({ organization_id: organizationId, name: form.name.trim(), address: form.address, niche: form.niche, phone: form.phone }))
      }
      if (error) throw error
      toast.success(isEdit ? 'Sucursal actualizada' : 'Sucursal creada')
      onSave()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="Ej: Sede Centro, Local Norte…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Tipo de negocio (niche) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de negocio</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(NICHE_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon
                const selected = form.niche === key
                return (
                  <button
                    key={key}
                    onClick={() => update('niche', key)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-medium transition-all
                      ${selected
                        ? `border-brand-500 bg-brand-50 text-brand-700`
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >
                    <Icon size={18} />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Define qué productos y categorías verá esta sucursal en el POS.
            </p>
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input
              value={form.address}
              onChange={e => update('address', e.target.value)}
              placeholder="Calle 10 # 5-20, Bogotá"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              placeholder="601 123 4567"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={15} />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de sucursal ───────────────────────────────────────────────────────
function BranchCard({ branch, isActive, onActivate, onEdit }) {
  const cfg  = NICHE_CONFIG[branch.niche] || NICHE_CONFIG.general
  const Icon = cfg.icon

  return (
    <div className={`relative bg-white rounded-2xl border-2 p-5 transition-all
      ${isActive ? 'border-brand-500 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>

      {isActive && (
        <span className="absolute top-3 right-3 text-xs bg-brand-600 text-white px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
          <CheckCircle2 size={11} /> Activa
        </span>
      )}

      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{branch.name}</h3>
          <p className={`text-xs font-medium mt-0.5 ${cfg.color.split(' ')[1]}`}>{cfg.label}</p>
          {branch.address && (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
              <MapPin size={10} /> {branch.address}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        {!isActive && (
          <button
            onClick={onActivate}
            className="flex-1 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 flex items-center justify-center gap-1"
          >
            <ChevronRight size={13} /> Activar
          </button>
        )}
        <button
          onClick={onEdit}
          className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
        >
          <Edit2 size={13} /> Editar
        </button>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function BranchesPage() {
  const { organization }                 = useAuth()
  const { branchId, dispatch }           = usePOS()
  const [branches, setBranches]          = useState([])
  const [loading, setLoading]            = useState(true)
  const [showModal, setShowModal]        = useState(false)
  const [editBranch, setEditBranch]      = useState(null)

  const planId = organization?.plan_id || 'free'
  const isProOrEnterprise = ['pro', 'enterprise'].includes(planId)
  const maxBranches = isProOrEnterprise ? (planId === 'enterprise' ? Infinity : 3) : 1

  useEffect(() => { loadBranches() }, [organization?.id])

  async function loadBranches() {
    if (!organization?.id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, address, phone, niche, is_active')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: true })
    if (!error) setBranches(data || [])
    setLoading(false)
  }

  function activateBranch(branch) {
    localStorage.setItem('ferzu_branch_id',    branch.id)
    localStorage.setItem('ferzu_branch_niche', branch.niche || 'general')
    dispatch({ type: 'SET_BRANCH',       payload: branch.id })
    dispatch({ type: 'SET_BRANCH_NICHE', payload: branch.niche || 'general' })
    toast.success(`Sucursal "${branch.name}" activada`)
  }

  function openNew() {
    if (branches.length >= maxBranches) {
      toast.error(`Tu plan ${planId} permite máximo ${maxBranches} sucursal${maxBranches > 1 ? 'es' : ''}`)
      return
    }
    setEditBranch(null)
    setShowModal(true)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={22} className="text-brand-600" />
            Sucursales
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cada sucursal tiene su propio tipo de negocio, productos y categorías.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand-700"
        >
          <Plus size={16} /> Nueva sucursal
        </button>
      </div>

      {/* Plan info */}
      {!isProOrEnterprise && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Zap size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Plan {planId} — 1 sucursal</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Actualiza al Plan Pro ($149.000/mes) para gestionar hasta 3 sucursales con diferentes tipos de negocio.
            </p>
          </div>
        </div>
      )}

      {/* Grid de branches */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map(br => (
            <BranchCard
              key={br.id}
              branch={br}
              isActive={br.id === branchId}
              onActivate={() => activateBranch(br)}
              onEdit={() => { setEditBranch(br); setShowModal(true) }}
            />
          ))}

          {/* Card para agregar (si no superó el límite) */}
          {branches.length < maxBranches && (
            <button
              onClick={openNew}
              className="border-2 border-dashed border-gray-300 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors min-h-[140px]"
            >
              <Plus size={24} />
              <span className="text-sm font-medium">Agregar sucursal</span>
            </button>
          )}
        </div>
      )}

      {/* Leyenda nichos */}
      <div className="mt-8">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tipos de negocio disponibles</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(NICHE_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon
            return (
              <span key={key} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                <Icon size={12} /> {cfg.label}
              </span>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          El tipo de negocio define qué productos y categorías aparecen en el POS de cada sucursal.
          Las categorías marcadas como "General" aparecen en todos los tipos.
        </p>
      </div>

      {/* Modal */}
      {showModal && (
        <BranchModal
          branch={editBranch}
          organizationId={organization?.id}
          onSave={() => { setShowModal(false); loadBranches() }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
