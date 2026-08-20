// =============================================================================
// FERZU POS — CustomerIdentModal
//
// Modal de identificación del cliente en el punto de venta.
// Flujo:
//   1. Buscar por cédula / NIT / celular
//   2. Si no existe → registrar nuevo cliente (inline)
//   3. Si no quiere dar datos → "Consumidor Final" (NIT 222222222222)
//
// Cumple Resolución DIAN 000165 de 2023.
// =============================================================================

import { useState } from 'react'
import { api } from '../lib/api.js'
import { CONSUMIDOR_FINAL } from '../constants/dian.js'

const FIELD_LABELS = {
  full_name: 'Nombre completo',
  id_number: 'Cédula / NIT',
  email:     'Correo electrónico',
  phone:     'Celular',
}

export default function CustomerIdentModal({ organizationId, onSelect, onClose }) {
  const [query,   setQuery]   = useState('')
  const [found,   setFound]   = useState(null)
  const [mode,    setMode]    = useState('search') // 'search' | 'new'
  const [form,    setForm]    = useState({ full_name: '', id_number: '', email: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // ── Buscar cliente existente (vía backend API) ────────────────────────────
  async function handleSearch() {
    const q = query.trim()
    if (!q) { setError('Ingresa cédula, NIT o celular'); return }
    setLoading(true); setError(''); setFound(null)

    try {
      const { data } = await api.get(`/customers/search?q=${encodeURIComponent(q)}`)
      setLoading(false)
      if (data.customer) {
        setFound(data.customer)
      } else {
        setError('No encontrado. Puedes registrarlo ahora.')
        setMode('new')
        setForm({ full_name: '', id_number: q, email: '', phone: '' })
      }
    } catch (err) {
      setLoading(false)
      setError(err?.response?.data?.error || 'Error al buscar. Intenta de nuevo.')
    }
  }

  // ── Registrar cliente nuevo (vía backend API) ─────────────────────────────
  async function handleCreate() {
    if (!form.full_name.trim()) { setError('El nombre es obligatorio'); return }
    setLoading(true); setError('')

    try {
      const { data } = await api.post('/customers', {
        full_name: form.full_name.trim(),
        id_number: form.id_number.trim() || null,
        email:     form.email.trim()     || null,
        phone:     form.phone.trim()     || null,
      })
      setLoading(false)
      onSelect(data.customer)
    } catch (err) {
      setLoading(false)
      // 409 = cédula duplicada → mostrar el cliente existente
      if (err?.response?.status === 409 && err.response.data.existing) {
        setFound(err.response.data.existing)
        setMode('search')
        setError('Este documento ya está registrado. Selecciónalo.')
      } else {
        const errData = err?.response?.data
        const msg = errData?.error
          || errData?.errors?.[0]?.msg
          || 'Error al registrar. Intenta de nuevo.'
        setError(msg)
      }
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSearch()
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[300] px-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-blue-600 px-6 py-4">
          <h2 className="text-white text-lg font-bold">Identificar cliente</h2>
          <p className="text-blue-100 text-xs mt-0.5">
            Resolución DIAN 000165/2023 — identificación en punto de venta
          </p>
        </div>

        <div className="p-6">

          {/* ── Modo búsqueda ── */}
          {mode === 'search' && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cédula, NIT o celular
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  autoFocus
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: 1234567890"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                />
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? '…' : 'Buscar'}
                </button>
              </div>

              {error && (
                <p className="text-amber-600 text-sm mb-3 bg-amber-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              {/* Cliente encontrado */}
              {found && (
                <div className="border border-green-300 rounded-xl p-4 bg-green-50 mb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">{found.full_name}</p>
                      <p className="text-sm text-gray-500">
                        {found.id_type || 'CC'} {found.id_number}
                      </p>
                      {found.phone && (
                        <p className="text-sm text-gray-500">📱 {found.phone}</p>
                      )}
                      {found.email && (
                        <p className="text-sm text-gray-500">✉️ {found.email}</p>
                      )}
                    </div>
                    <span className="text-green-600 text-xs font-medium bg-green-100 px-2 py-1 rounded-full">
                      Encontrado
                    </span>
                  </div>
                  <button
                    onClick={() => onSelect(found)}
                    className="mt-3 w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700"
                  >
                    Seleccionar este cliente ✓
                  </button>
                </div>
              )}

              <button
                onClick={() => { setMode('new'); setForm({ full_name: '', id_number: query, email: '', phone: '' }); setError('') }}
                className="w-full border border-dashed border-blue-400 text-blue-600 py-2 rounded-lg text-sm hover:bg-blue-50 mb-2"
              >
                + Registrar cliente nuevo
              </button>
            </>
          )}

          {/* ── Modo registro nuevo ── */}
          {mode === 'new' && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => { setMode('search'); setError(''); setFound(null) }}
                  className="text-blue-600 text-sm hover:underline"
                >
                  ← Volver a búsqueda
                </button>
                <span className="text-gray-400 text-xs">· Cliente nuevo</span>
              </div>

              {Object.keys(FIELD_LABELS).map(field => (
                <div key={field} className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {FIELD_LABELS[field]}
                    {field === 'full_name' && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    autoFocus={field === 'full_name'}
                    type={field === 'email' ? 'email' : 'text'}
                    inputMode={field === 'phone' || field === 'id_number' ? 'numeric' : 'text'}
                  />
                </div>
              ))}

              {error && (
                <p className="text-red-600 text-sm mb-3 bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 mb-2"
              >
                {loading ? 'Guardando…' : 'Registrar y continuar →'}
              </button>
            </>
          )}

          {/* ── Separador ── */}
          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* ── Consumidor Final (DIAN) ── */}
          <button
            onClick={() => onSelect(CONSUMIDOR_FINAL)}
            className="w-full border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            <span>👤</span>
            <span>Continuar como <strong>Consumidor Final</strong></span>
            <span className="text-xs text-gray-400">(NIT 222222222222)</span>
          </button>

          <p className="text-center text-xs text-gray-400 mt-2">
            Opción válida si el cliente no desea identificarse
          </p>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
