/**
 * FERZU POS — Recibo por WhatsApp
 * Genera un link wa.me con el recibo formateado.
 * Sin API de pago, 100% gratis, muy colombiano.
 */

import { useState } from 'react'
import { MessageCircle, Phone, Check } from 'lucide-react'

const COP = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export function WhatsAppReceipt({ order, businessName, onClose }) {
  const [phone,  setPhone]  = useState('')
  const [sent,   setSent]   = useState(false)

  const { order_number, items = [], total, payment_method, created_at } = order

  const metodoPago = {
    cash:     'Efectivo',
    card:     'Tarjeta',
    bold:     'Bold',
    transfer: 'Transferencia',
    split:    'Mixto',
  }[payment_method] || payment_method

  function buildMessage() {
    const fecha = new Date(created_at || Date.now()).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const itemLines = items.map(i =>
      `  • ${i.product_name} x${i.quantity} — ${COP(i.unit_price * i.quantity)}`
    ).join('\n')

    return [
      `🧾 *RECIBO DE COMPRA*`,
      `📍 *${businessName || 'FERZU POS'}*`,
      ``,
      `📋 Orden #: *${order_number || '—'}*`,
      `🗓️ Fecha: ${fecha}`,
      `💳 Pago: ${metodoPago}`,
      ``,
      `*PRODUCTOS:*`,
      itemLines,
      ``,
      `💰 *TOTAL: ${COP(total)}*`,
      ``,
      `¡Gracias por tu compra! 💚`,
      `_Powered by FERZU POS_`,
    ].join('\n')
  }

  function handleSend() {
    const rawPhone = phone.replace(/\D/g, '')
    // Agregar prefijo Colombia si no lo tiene
    const fullPhone = rawPhone.startsWith('57') ? rawPhone : `57${rawPhone}`
    const message   = encodeURIComponent(buildMessage())
    const url       = `https://wa.me/${fullPhone}?text=${message}`
    window.open(url, '_blank', 'noopener,noreferrer')
    setSent(true)
  }

  function handleSendNoPhone() {
    // Abrir WhatsApp sin número (el usuario elige el contacto)
    const message = encodeURIComponent(buildMessage())
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer')
    setSent(true)
  }

  function formatPhone(val) {
    const raw = val.replace(/\D/g, '').slice(0, 10)
    if (raw.length <= 3) return raw
    if (raw.length <= 6) return `${raw.slice(0, 3)} ${raw.slice(3)}`
    return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`
  }

  if (sent) {
    return (
      <div className="text-center py-6 space-y-3">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Check className="w-7 h-7 text-green-600" />
        </div>
        <p className="font-semibold text-gray-800">¡WhatsApp abierto!</p>
        <p className="text-sm text-gray-500">Solo confirma el envío en WhatsApp.</p>
        <button
          onClick={onClose}
          className="mt-2 px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
        >
          Listo
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Preview del mensaje */}
      <div className="bg-[#ECE5DD] rounded-xl p-4 text-sm font-mono whitespace-pre-wrap text-gray-800 max-h-48 overflow-y-auto border border-[#ccc]">
        {buildMessage()}
      </div>

      {/* Número de teléfono */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Phone className="w-4 h-4 text-green-600" />
          Número del cliente (opcional)
        </label>
        <input
          value={phone}
          onChange={e => setPhone(formatPhone(e.target.value))}
          placeholder="300 123 4567"
          inputMode="tel"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm
                     focus:outline-none focus:border-green-500 transition-colors"
        />
        <p className="text-xs text-gray-400">Sin código de país — lo agregamos automáticamente (+57)</p>
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        {phone.replace(/\D/g, '').length >= 10 ? (
          <button
            onClick={handleSend}
            className="flex-1 py-3 bg-[#25D366] text-white rounded-xl font-semibold
                       hover:bg-[#1EBE59] transition-colors flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            Enviar al {phone}
          </button>
        ) : (
          <button
            onClick={handleSendNoPhone}
            className="flex-1 py-3 bg-[#25D366] text-white rounded-xl font-semibold
                       hover:bg-[#1EBE59] transition-colors flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            Abrir WhatsApp
          </button>
        )}
        <button
          onClick={onClose}
          className="px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 text-sm font-medium"
        >
          Omitir
        </button>
      </div>
    </div>
  )
}

export default WhatsAppReceipt
