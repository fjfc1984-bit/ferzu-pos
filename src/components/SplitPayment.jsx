/**
 * FERZU POS — Pago Mixto (Efectivo + Tarjeta)
 * El cliente puede pagar con múltiples métodos en una sola venta.
 * Regla de Oro: NUNCA calculamos totales aquí — solo capturamos montos.
 * El backend valida que (cash + card) >= total.
 */

import { useState, useEffect } from 'react'
import { DollarSign, CreditCard, Check, AlertCircle } from 'lucide-react'

const COP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export function SplitPayment({ total, onConfirm, onCancel }) {
  const [cashAmount,  setCashAmount]  = useState('')
  const [cardAmount,  setCardAmount]  = useState('')
  const [error,       setError]       = useState('')

  // Auto-calcular el monto de tarjeta cuando el usuario ingresa el de efectivo
  useEffect(() => {
    const cash = parseCOP(cashAmount)
    if (cash > 0 && cash < total) {
      setCardAmount(formatCOP(total - cash))
    } else if (cash >= total) {
      setCardAmount('')
    }
  }, [cashAmount, total])

  function parseCOP(str) {
    return Math.round(Number(String(str).replace(/\D/g, '')) || 0)
  }

  function formatCOP(n) {
    return new Intl.NumberFormat('es-CO').format(n)
  }

  function handleCashChange(e) {
    const raw = e.target.value.replace(/\D/g, '')
    setCashAmount(raw ? formatCOP(Number(raw)) : '')
    setError('')
  }

  function handleCardChange(e) {
    const raw = e.target.value.replace(/\D/g, '')
    setCardAmount(raw ? formatCOP(Number(raw)) : '')
    setError('')
  }

  function handleConfirm() {
    const cash = parseCOP(cashAmount)
    const card = parseCOP(cardAmount)
    const suma = cash + card

    if (suma < total) {
      setError(`Faltan ${COP(total - suma)} para completar el pago`)
      return
    }

    onConfirm({
      method:      'split',
      cash_amount: cash,
      card_amount: card,
      cash_received: cash,  // Para calcular cambio en backend
      overpayment: suma - total,
    })
  }

  const cash    = parseCOP(cashAmount)
  const card    = parseCOP(cardAmount)
  const covered = cash + card
  const missing = Math.max(0, total - covered)
  const change  = Math.max(0, covered - total)
  const pct     = Math.min(100, (covered / total) * 100)

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-sm text-gray-500 mb-1">Total a cobrar</p>
        <p className="text-3xl font-bold text-gray-900">{COP(total)}</p>
      </div>

      {/* Barra de progreso */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Efectivo */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          Efectivo
        </label>
        <input
          value={cashAmount}
          onChange={handleCashChange}
          placeholder="$ 0"
          inputMode="numeric"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold text-right
                     focus:outline-none focus:border-emerald-500 transition-colors"
        />
      </div>

      {/* Tarjeta / Bold */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-blue-500" />
          Tarjeta / Nequi / PSE
        </label>
        <input
          value={cardAmount}
          onChange={handleCardChange}
          placeholder="$ 0"
          inputMode="numeric"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold text-right
                     focus:outline-none focus:border-blue-400 transition-colors"
        />
      </div>

      {/* Resumen */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Efectivo</span>
          <span className="font-medium">{COP(cash)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Tarjeta</span>
          <span className="font-medium">{COP(card)}</span>
        </div>
        <div className="border-t pt-2 flex justify-between font-semibold">
          <span>Total cubierto</span>
          <span className={covered >= total ? 'text-emerald-600' : 'text-amber-600'}>{COP(covered)}</span>
        </div>
        {missing > 0 && (
          <div className="flex justify-between text-red-600 font-medium">
            <span>Falta</span>
            <span>{COP(missing)}</span>
          </div>
        )}
        {change > 0 && (
          <div className="flex justify-between text-emerald-600 font-medium">
            <span>Cambio a devolver</span>
            <span>{COP(change)}</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Botones */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={covered < total}
          className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          Cobrar {COP(total)}
        </button>
      </div>
    </div>
  )
}

export default SplitPayment
