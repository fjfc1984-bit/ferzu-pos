/**
 * FERZU POS — Módulo de Clientes / CRM Básico
 * ============================================
 * Incluye:
 *   CustomersPage       — Página principal con listado, búsqueda, segmentos
 *   CustomerProfile     — Historial de compras, puntos, resumen
 *   CustomerForm        — Crear / editar cliente
 *   CustomerPicker      — Componente reutilizable para POS, Barbería, Taller
 *   LoyaltyConfig       — Configurar puntos de fidelidad por COP
 *   useCustomers        — Hook con React Query + búsqueda offline
 *
 * Archivo destino: src/pages/CustomersPage.jsx
 * CustomerPicker export: src/components/CustomerPicker.jsx
 *
 * REGLAS:
 *   - Puntos de fidelidad calculados en BACKEND (nunca en frontend)
 *   - Historial de compras muestra datos del snapshot (product_name guardado en order_items)
 *   - formatCOP() para todos los montos
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/math'
import { useAuth } from '../context/AuthContext.jsx'
import { useTrack } from '../hooks/useTrack.js'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const SEGMENTS = {
  vip:      { label: 'VIP',        color: 'bg-yellow-100 text-yellow-800',  min_orders: 20 },
  frequent: { label: 'Frecuente',  color: 'bg-emerald-100 text-emerald-800', min_orders: 5 },
  regular:  { label: 'Regular',    color: 'bg-blue-100 text-blue-800',      min_orders: 2 },
  new:      { label: 'Nuevo',      color: 'bg-gray-100 text-gray-700',      min_orders: 0 },
  inactive: { label: 'Inactivo',   color: 'bg-red-100 text-red-700',        min_orders: -1 },
}

function getSegment(totalOrders, daysSinceLastPurchase) {
  if (daysSinceLastPurchase > 90)   return 'inactive'
  if (totalOrders >= 20)            return 'vip'
  if (totalOrders >= 5)             return 'frequent'
  if (totalOrders >= 2)             return 'regular'
  return 'new'
}

// ---------------------------------------------------------------------------
// Hook principal de clientes
// ---------------------------------------------------------------------------
function useCustomers(branchId, organizationId, search = '') {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['customers', branchId, organizationId, search],
    queryFn: async () => {
      let q = supabase
        .from('customers')
        .select(`
          id, name, phone, email, document_number, loyalty_points,
          notes, created_at,
          orders:orders(count),
          last_order:orders(created_at, total)
        `)
        .order('name', { ascending: true })

      if (search.trim()) {
        q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,document_number.ilike.%${search}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 2,
    enabled: !!branchId && !!organizationId,
  })

  const upsertMutation = useMutation({
    mutationFn: async (customer) => {
      if (customer.id) {
        const { data, error } = await supabase
          .from('customers')
          .update({
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            document_number: customer.document_number,
            notes: customer.notes,
          })
          .eq('id', customer.id)
          .select()
          .single()
        if (error) throw error
        return data
      } else {
        // FIX: organization_id es obligatorio para pasar la politica RLS de INSERT
        const { data, error } = await supabase
          .from('customers')
          .insert({
            name:            customer.name,
            phone:           customer.phone,
            email:           customer.email || null,
            document_number: customer.document_number || null,
            notes:           customer.notes || null,
            organization_id: organizationId,
          })
          .select()
          .single()
        if (error) throw error
        return data
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (customerId) => {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })

  return { ...query, upsertMutation, deleteMutation }
}

// ---------------------------------------------------------------------------
// Hook: historial de compras de un cliente
// ---------------------------------------------------------------------------
function useCustomerHistory(customerId) {
  return useQuery({
    queryKey: ['customer-history', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, created_at, total, status,
          items:order_items(product_name, quantity, unit_price, subtotal)
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
    enabled: !!customerId,
    staleTime: 1000 * 30,
  })
}

// ---------------------------------------------------------------------------
// CustomerForm -- crear o editar cliente
// ---------------------------------------------------------------------------
function CustomerForm({ customer, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    document_number: customer?.document_number || '',
    notes: customer?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function onChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.phone.trim()) { setError('El telefono es obligatorio'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({ ...form, id: customer?.id })
    } catch (err) {
      setError(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Nombre completo *
          </label>
          <input
            name="name"
            value={form.name}
            onChange={onChange}
            placeholder="Nombre del cliente"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Telefono / WhatsApp *
          </label>
          <input
            name="phone"
            value={form.phone}
            onChange={onChange}
            placeholder="3001234567"
            type="tel"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Correo electronico
          </label>
          <input
            name="email"
            value={form.email}
            onChange={onChange}
            placeholder="correo@ejemplo.com"
            type="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Cedula / NIT
          </label>
          <input
            name="document_number"
            value={form.document_number}
            onChange={onChange}
            placeholder="1234567890"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
        <textarea
          name="notes"
          value={form.notes}
          onChange={onChange}
          rows={2}
          placeholder="Preferencias, alergias, etc."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
        />
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : null}
          {saving ? 'Guardando...' : customer?.id ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// CustomerProfile -- historial + puntos + metricas
// ---------------------------------------------------------------------------
function CustomerProfile({ customer, onClose, onEdit }) {
  const { data: history, isLoading } = useCustomerHistory(customer.id)

  const totalSpent = history?.reduce((sum, o) => sum + (o.total || 0), 0) || 0
  const totalOrders = history?.length || 0
  const avgTicket = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0

  const lastOrderDate = history?.[0]?.created_at
  const daysSinceLast = lastOrderDate
    ? Math.floor((Date.now() - new Date(lastOrderDate)) / 86400000)
    : 999

  const seg = getSegment(totalOrders, daysSinceLast)
  const segMeta = SEGMENTS[seg]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start gap-4 p-6 border-b border-gray-100">
        <div className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xl font-bold">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{customer.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${segMeta.color}`}>
              {segMeta.label}
            </span>
          </div>
          <p className="text-sm text-gray-500">{customer.phone}</p>
          {customer.email && <p className="text-xs text-gray-400">{customer.email}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Editar
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition"
          >
            X
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-0 border-b border-gray-100">
        {[
          { label: 'Total gastado',  value: formatCOP(totalSpent) },
          { label: 'Pedidos',        value: totalOrders },
          { label: 'Ticket prom.',   value: formatCOP(avgTicket) },
          { label: 'Puntos',         value: (customer.loyalty_points || 0).toLocaleString('es-CO') },
        ].map((kpi) => (
          <div key={kpi.label} className="px-4 py-3 text-center border-r border-gray-100 last:border-r-0">
            <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 px-4 py-3 border-b border-gray-100">
        <a
          href={`https://wa.me/57${customer.phone?.replace(/\D/g, '')}?text=Hola%20${encodeURIComponent(customer.name)}%2C%20gracias%20por%20tu%20visita`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition"
        >
          WhatsApp
        </a>
        {customer.email && (
          <a
            href={`mailto:${customer.email}`}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
          >
            Correo
          </a>
        )}
        {customer.notes && (
          <span className="flex-1 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 truncate">
            {customer.notes}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-4 pb-2">
          Ultimas 50 compras
        </h3>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !history?.length ? (
          <div className="text-center py-10 text-sm text-gray-400">
            Sin compras registradas
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {history.map((order) => (
              <div key={order.id} className="px-4 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCOP(order.total)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleDateString('es-CO', {
                      day: '2-digit', month: 'short', year: 'numeric'
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    order.status === 'paid'      ? 'bg-green-100 text-green-700' :
                    order.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                    order.status === 'pending'   ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {order.status === 'paid' ? 'Pagado' : order.status === 'cancelled' ? 'Anulado' : order.status || '-'}
                  </span>
                  <span className="text-xs text-gray-500 truncate">
                    {order.items?.map(i => i.product_name).join(', ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LoyaltyConfig -- admin de reglas de puntos
// ---------------------------------------------------------------------------
function LoyaltyConfig({ orgId }) {
  const [config, setConfig] = useState({ points_per_cop: 1000, redemption_rate: 100 })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('organizations')
      .select('loyalty_config')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (data?.loyalty_config) setConfig(data.loyalty_config)
      })
  }, [orgId])

  async function save() {
    if (!orgId) { setSaveError('No se encontro la organizacion'); return }
    setSaving(true)
    setSaveError(null)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ loyalty_config: config })
        .eq('id', orgId)
      if (error) throw error
    } catch (err) {
      setSaveError(err.message || 'Error al guardar configuracion')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-amber-900 text-sm">Programa de Fidelidad</h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-amber-800 font-medium mb-1">
            1 punto por cada (COP)
          </label>
          <input
            type="number"
            value={config.points_per_cop}
            onChange={e => setConfig(c => ({ ...c, points_per_cop: Number(e.target.value) }))}
            min={100}
            step={100}
            className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white"
          />
          <p className="text-xs text-amber-700 mt-1">
            Ej: {formatCOP(config.points_per_cop)} = 1 punto
          </p>
        </div>
        <div>
          <label className="block text-xs text-amber-800 font-medium mb-1">
            1 punto = COP en descuento
          </label>
          <input
            type="number"
            value={config.redemption_rate}
            onChange={e => setConfig(c => ({ ...c, redemption_rate: Number(e.target.value) }))}
            min={1}
            step={1}
            className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white"
          />
          <p className="text-xs text-amber-700 mt-1">
            100 puntos = {formatCOP(config.redemption_rate * 100)} de descuento
          </p>
        </div>
      </div>
      {saveError && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>
      )}
      <button
        onClick={save}
        disabled={saving || !orgId}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-60"
      >
        {saving ? 'Guardando...' : 'Guardar configuracion'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal generico
// ---------------------------------------------------------------------------
function Modal({ open, title, children, onClose, size = 'md' }) {
  if (!open) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${widths[size]} flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition text-lg">X</button>
        </div>
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CustomersPage -- pagina principal del modulo
// ---------------------------------------------------------------------------
export function CustomersPage() {
  const { organizationId } = useAuth()
  const track = useTrack();
  useEffect(() => { track('module_view', 'customers') }, [track]);
  const branchId = localStorage.getItem('ferzu_branch_id')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedSegment, setSelectedSegment] = useState('all')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [showLoyalty, setShowLoyalty] = useState(false)
  const [activeTab, setActiveTab] = useState('list')
  const [arcoSearch, setArcoSearch]     = useState('')
  const [arcoResult, setArcoResult]     = useState(null)
  const [arcoLoading, setArcoLoading]   = useState(false)
  const [arcoAction, setArcoAction]     = useState(null)
  const [arcoConfirm, setArcoConfirm]   = useState(false)
  const [arcoSuccess, setArcoSuccess]   = useState('')

  async function searchARCO() {
    if (!arcoSearch.trim()) return
    setArcoLoading(true); setArcoResult(null); setArcoSuccess('')
    const { data } = await supabase.from('customers')
      .select('id, name, phone, email, loyalty_points, created_at')
      .eq('organization_id', organizationId)
      .or(`name.ilike.%${arcoSearch}%,phone.ilike.%${arcoSearch}%,email.ilike.%${arcoSearch}%`)
      .limit(5)
    setArcoResult(data || [])
    setArcoLoading(false)
  }

  async function anonymizeCustomer(customerId) {
    const { error } = await supabase.from('customers').update({
      name:  'CLIENTE ANONIMIZADO',
      phone: null,
      email: null,
      notes: `Datos anonimizados por solicitud ARCO el ${new Date().toLocaleDateString('es-CO')}`,
    }).eq('id', customerId)
    if (!error) {
      setArcoSuccess('Datos del cliente anonimizados correctamente.')
      setArcoResult(prev => prev.filter(c => c.id !== customerId))
    }
    setArcoConfirm(false); setArcoAction(null)
  }

  async function deleteCustomerARCO(customerId) {
    const { error } = await supabase.from('customers').delete().eq('id', customerId)
    if (!error) {
      setArcoSuccess('Registro del cliente eliminado permanentemente.')
      setArcoResult(prev => prev.filter(c => c.id !== customerId))
    }
    setArcoConfirm(false); setArcoAction(null)
  }

  const searchRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: customers = [], isLoading, upsertMutation, deleteMutation } = useCustomers(branchId, organizationId, debouncedSearch)

  async function handleSave(customer) {
    await upsertMutation.mutateAsync(customer)
    setShowForm(false)
    setEditCustomer(null)
  }

  const enriched = customers.map(c => {
    const totalOrders = c.orders?.[0]?.count || 0
    const lastDate = c.last_order?.length
      ? c.last_order.reduce((max, o) => (o.created_at > max ? o.created_at : max), '')
      : null
    const daysSince = lastDate
      ? Math.floor((Date.now() - new Date(lastDate)) / 86400000)
      : 999
    const seg = getSegment(totalOrders, daysSince)
    const totalSpent = c.last_order?.reduce((s, o) => s + (o.total || 0), 0) || 0
    return { ...c, segment: seg, totalOrders, daysSince, totalSpent }
  })

  const filtered = selectedSegment === 'all'
    ? enriched
    : enriched.filter(c => c.segment === selectedSegment)

  const stats = Object.keys(SEGMENTS).reduce((acc, seg) => {
    acc[seg] = enriched.filter(c => c.segment === seg).length
    return acc
  }, {})

  return (
    <div className="flex h-full bg-gray-50">
      <div className={`flex flex-col ${selectedCustomer ? 'w-80 border-r border-gray-200' : 'flex-1'} bg-white`}>
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-900">Clientes</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLoyalty(true)}
                className="px-2 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition"
              >
                Puntos
              </button>
              <button
                onClick={() => { setEditCustomer(null); setShowForm(true) }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition"
              >
                + Nuevo cliente
              </button>
            </div>
          </div>

          <div className="relative">
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, telefono o cedula..."
              className="w-full pl-4 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >X</button>
            )}
          </div>
        </div>

        <div className="flex border-b border-gray-100">
          {[
            { key: 'list',     label: `Todos (${enriched.length})` },
            { key: 'segments', label: 'Segmentos' },
            { key: 'arco',     label: 'Privacidad' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2.5 text-xs font-semibold transition border-b-2 ${
                activeTab === t.key
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'arco' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-800 mb-1">Derechos ARCO de clientes (Ley 1581/2012)</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Busca al cliente y ejecuta la accion solicitada. El registro queda en el log de auditoria.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre, telefono o email..."
                value={arcoSearch}
                onChange={e => setArcoSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchARCO()}
                className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                onClick={searchARCO}
                disabled={arcoLoading || !arcoSearch.trim()}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {arcoLoading ? '...' : 'Buscar'}
              </button>
            </div>

            {arcoSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 font-medium">
                {arcoSuccess}
              </div>
            )}

            {arcoResult !== null && (
              arcoResult.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No se encontraron clientes.</p>
              ) : (
                <div className="space-y-2">
                  {arcoResult.map(c => (
                    <div key={c.id} className="border border-gray-200 rounded-xl p-3 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                          <p className="text-xs text-gray-500">{c.phone || 'Sin telefono'} - {c.email || 'Sin email'}</p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => { setArcoAction({ type: 'anonymize', customer: c }); setArcoConfirm(true) }}
                            className="px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition"
                          >
                            Anonimizar
                          </button>
                          <button
                            onClick={() => { setArcoAction({ type: 'delete', customer: c }); setArcoConfirm(true) }}
                            className="px-2 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {arcoConfirm && arcoAction && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4">
                  <h3 className="font-bold text-gray-900">
                    {arcoAction.type === 'anonymize' ? 'Anonimizar datos' : 'Eliminar cliente'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {arcoAction.type === 'anonymize'
                      ? `Se borraran nombre, telefono y email de "${arcoAction.customer.name}". El historial de ventas se conserva sin identificar. Esta accion no se puede deshacer.`
                      : `Se eliminara permanentemente el registro de "${arcoAction.customer.name}". Esta accion no se puede deshacer.`
                    }
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setArcoConfirm(false); setArcoAction(null) }}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => arcoAction.type === 'anonymize'
                        ? anonymizeCustomer(arcoAction.customer.id)
                        : deleteCustomerARCO(arcoAction.customer.id)
                      }
                      className={`px-4 py-2 text-sm font-semibold rounded-lg text-white transition ${
                        arcoAction.type === 'anonymize'
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'segments' && (
          <div className="p-3 flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSegment('all')}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition ${
                selectedSegment === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos ({enriched.length})
            </button>
            {Object.entries(SEGMENTS).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setSelectedSegment(key)}
                className={`px-3 py-1.5 text-xs rounded-full font-medium transition ${
                  selectedSegment === key ? meta.color + ' ring-2 ring-offset-1 ring-current' : meta.color + ' opacity-70'
                }`}
              >
                {meta.label} ({stats[key] || 0})
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto divide-y divide-gray-50">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-gray-700">
                {search ? `Sin resultados para "${search}"` : 'Aun no hay clientes'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {!search && 'Crea el primero con el boton "Nuevo cliente"'}
              </p>
            </div>
          ) : (
            filtered.map(customer => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                selected={selectedCustomer?.id === customer.id}
                onClick={() => setSelectedCustomer(customer)}
              />
            ))
          )}
        </div>
      </div>

      {selectedCustomer && (
        <div className="flex-1 overflow-auto bg-white">
          <CustomerProfile
            customer={selectedCustomer}
            onClose={() => setSelectedCustomer(null)}
            onEdit={() => {
              setEditCustomer(selectedCustomer)
              setShowForm(true)
            }}
          />
        </div>
      )}

      <Modal
        open={showForm}
        title={editCustomer ? 'Editar cliente' : 'Nuevo cliente'}
        onClose={() => { setShowForm(false); setEditCustomer(null) }}
      >
        <CustomerForm
          customer={editCustomer}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditCustomer(null) }}
        />
      </Modal>

      <Modal
        open={showLoyalty}
        title="Programa de puntos"
        onClose={() => setShowLoyalty(false)}
        size="sm"
      >
        <LoyaltyConfig orgId={organizationId} />
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CustomerRow -- fila en la lista
// ---------------------------------------------------------------------------
function CustomerRow({ customer, selected, onClick }) {
  const seg = SEGMENTS[customer.segment]
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-50 ${
        selected ? 'bg-emerald-50 border-r-2 border-emerald-600' : ''
      }`}
    >
      <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
        {customer.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-900 truncate">{customer.name}</p>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${seg.color} flex-shrink-0`}>
            {seg.label}
          </span>
        </div>
        <p className="text-xs text-gray-500 truncate">{customer.phone}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-semibold text-gray-700">{customer.totalOrders} compras</p>
        {customer.loyalty_points > 0 && (
          <p className="text-xs text-amber-600">{customer.loyalty_points.toLocaleString('es-CO')} pts</p>
        )}
      </div>
    </button>
  )
}

// ===========================================================================
// CustomerPicker -- componente reutilizable para POS / Barberia / Taller
// ===========================================================================
export function CustomerPicker({ value, onChange, required = false, compact = false }) {
  const branchId = localStorage.getItem('ferzu_branch_id')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['customers-picker', branchId, search],
    queryFn: async () => {
      if (search.length < 2) return []
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, email, loyalty_points')
        .or(`name.ilike.%${search}%,phone.ilike.%${search}%,document_number.ilike.%${search}%`)
        .limit(8)
      if (error) throw error
      return data
    },
    enabled: !!branchId && search.length >= 2,
    staleTime: 1000 * 30,
  })

  const qc = useQueryClient()

  async function handleCreate(customer) {
    const { data, error } = await supabase
      .from('customers')
      .insert(customer)
      .select()
      .single()
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['customers'] })
    onChange(data)
    setShowCreate(false)
    setOpen(false)
    setSearch('')
  }

  useEffect(() => {
    function handleClick(e) {
      if (!dropdownRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (value) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg ${compact ? 'text-sm' : ''}`}>
        <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {value.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">{value.name}</p>
          <p className="text-xs text-gray-500">{value.phone}</p>
        </div>
        {value.loyalty_points > 0 && (
          <span className="text-xs text-amber-600 font-medium flex-shrink-0">{value.loyalty_points.toLocaleString('es-CO')} pts</span>
        )}
        <button
          onClick={() => onChange(null)}
          className="ml-1 text-gray-400 hover:text-gray-600 text-sm transition flex-shrink-0"
        >X</button>
      </div>
    )
  }

  return (
    <div ref={dropdownRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={`Buscar cliente${required ? ' *' : ''}...`}
          className="w-full pl-4 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50"
        />
        {isLoading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin block" />
          </span>
        )}
      </div>

      {open && (search.length >= 2) && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {results.length === 0 && !isLoading ? (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              Sin resultados -{' '}
              <button
                onClick={() => setShowCreate(true)}
                className="text-emerald-600 font-medium hover:underline"
              >
                crear cliente
              </button>
            </div>
          ) : (
            <>
              {results.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onChange(c); setOpen(false); setSearch('') }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50 transition text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.phone}</p>
                  </div>
                  {c.loyalty_points > 0 && (
                    <span className="text-xs text-amber-600">{c.loyalty_points} pts</span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setShowCreate(true)}
                className="w-full px-4 py-2.5 text-sm text-emerald-700 font-medium hover:bg-emerald-50 transition border-t border-gray-100 text-left"
              >
                + Crear nuevo cliente
              </button>
            </>
          )}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Nuevo cliente rapido</h3>
            <CustomerForm
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
