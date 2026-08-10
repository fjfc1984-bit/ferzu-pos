/**
 * FERZU POS — Botón de impresión térmica
 * Conecta a impresora USB y envía el recibo ESC/POS.
 * Si Web USB no está disponible, hace fallback a window.print()
 *
 * Props:
 *   order        — objeto de la orden completa
 *   businessName — nombre del negocio
 *   branchName   — nombre de la sucursal (opcional)
 *   cashierName  — nombre del cajero (opcional)
 *   variant      — 'icon' | 'full' (default: 'full')
 *   onDone       — callback después de imprimir (opcional)
 */

import { useState } from 'react'
import { Printer, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { getPrinter } from '../lib/thermalPrinter.js'

export function ThermalPrintButton({
  order,
  businessName,
  branchName,
  cashierName,
  nit,
  address,
  phone,
  taxRegime,
  variant = 'full',
  onDone,
}) {
  const [status, setStatus] = useState('idle')   // idle | connecting | printing | done | error
  const [errMsg, setErrMsg] = useState('')

  const supportsUSB = 'usb' in navigator

  async function handlePrint() {
    if (!supportsUSB) {
      // Fallback: abrir recibo en ventana nueva para imprimir desde el navegador
      printFallback({ order, businessName, branchName, cashierName, nit, address, phone, taxRegime })
      if (onDone) onDone()
      return
    }

    setStatus('connecting')
    setErrMsg('')
    const printer = getPrinter()

    try {
      await printer.connect()
      setStatus('printing')
      await printer.printReceipt({ order, businessName, branchName, cashierName, nit, address, phone, taxRegime })
      setStatus('done')
      if (onDone) onDone()
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err) {
      setErrMsg(err.message || 'Error de impresión')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    } finally {
      try { await printer.disconnect() } catch {}
    }
  }

  const labels = {
    idle:       'Imprimir',
    connecting: 'Conectando…',
    printing:   'Imprimiendo…',
    done:       '¡Impreso!',
    error:      'Error',
  }

  const icons = {
    idle:       <Printer className="w-4 h-4" />,
    connecting: <Loader2 className="w-4 h-4 animate-spin" />,
    printing:   <Loader2 className="w-4 h-4 animate-spin" />,
    done:       <CheckCircle className="w-4 h-4" />,
    error:      <AlertCircle className="w-4 h-4" />,
  }

  const colors = {
    idle:       'bg-gray-100 text-gray-700 hover:bg-gray-200',
    connecting: 'bg-gray-100 text-gray-500',
    printing:   'bg-blue-50 text-blue-600',
    done:       'bg-emerald-50 text-emerald-700',
    error:      'bg-red-50 text-red-600',
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handlePrint}
        disabled={status !== 'idle'}
        title={errMsg || labels[status]}
        className={`p-2 rounded-lg transition-colors disabled:cursor-not-allowed ${colors[status]}`}
      >
        {icons[status]}
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handlePrint}
        disabled={status !== 'idle'}
        className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl
                    text-sm font-medium transition-colors disabled:cursor-not-allowed ${colors[status]}`}
      >
        {icons[status]}
        {labels[status]}
        {!supportsUSB && status === 'idle' && (
          <span className="text-xs opacity-60">(navegador)</span>
        )}
      </button>
      {status === 'error' && errMsg && (
        <p className="text-xs text-red-500 text-center">{errMsg}</p>
      )}
    </div>
  )
}

// ── Fallback para navegadores sin Web USB ─────────────────────────────────────
function printFallback({ order, businessName, branchName, cashierName, nit, address, phone, taxRegime }) {
  const COP = (n) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

  // IVA label con porcentaje si todos los ítems tienen el mismo rate
  const orderItems = order.order_items || []
  const vatRates   = [...new Set(orderItems.filter(i => i.vat_rate > 0).map(i => i.vat_rate))]
  const ivaLabel   = vatRates.length === 1 ? `IVA ${vatRates[0]}%` : 'IVA'

  const metodoPago = {
    cash:      'Efectivo',
    card:      'Tarjeta',
    bold:      'Bold / Nequi',
    nequi:     'Nequi',
    daviplata: 'Daviplata',
    transfer:  'Transferencia',
    split:     'Pago mixto',
  }[order.payment_method] || order.payment_method || '—'

  const itemRows = orderItems
    .map(i => {
      const isCourtesy = i.is_courtesy
      const rowStyle   = isCourtesy ? 'color:#888;text-decoration:line-through' : ''
      return `<tr style="${rowStyle}">
        <td style="padding:2px 4px">${i.quantity}x ${i.product_name}${isCourtesy ? ' (CORTESÍA)' : ''}</td>
        <td style="padding:2px 4px;text-align:right">${isCourtesy ? 'GRATIS' : COP(i.unit_price * i.quantity)}</td>
      </tr>`
    })
    .join('')

  const subtotal        = order.subtotal        || 0
  const discountAmount  = order.discount_amount  || 0
  const loyaltyDiscount = order.loyalty_discount || 0
  const taxAmount       = order.tax_amount       || 0
  const total           = order.total            || 0
  const cashReceived    = order.cash_received    || 0
  const changeAmount    = order.change_amount    || 0

  // Datos del comprador (factura electrónica)
  const buyerNit   = order.buyer_nit   || ''
  const buyerName  = order.buyer_name  || ''
  const buyerEmail = order.buyer_email || ''
  const cufe       = order.cufe        || ''
  const hasBuyer   = buyerNit || buyerName

  const fecha = new Date(order.created_at || Date.now()).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Recibo #${order.order_number || ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; padding: 4px; }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: bold; }
    .small  { font-size: 10px; }
    .sep    { border-top: 1px dashed #000; margin: 6px 0; }
    table   { width: 100%; border-collapse: collapse; }
    td      { vertical-align: top; }
    .totals td { padding: 1px 4px; }
    .row-total td { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 3px; }
    .label-row { font-size: 10px; color: #555; }
  </style>
</head>
<body>

  <!-- CABECERA NEGOCIO -->
  <div class="center bold" style="font-size:15px">${businessName}</div>
  ${nit       ? `<div class="center small">NIT: ${nit}</div>` : ''}
  ${taxRegime ? `<div class="center small">${taxRegime}</div>` : ''}
  ${address   ? `<div class="center small">${address}</div>` : ''}
  ${phone     ? `<div class="center small">Tel: ${phone}</div>` : ''}
  ${branchName ? `<div class="center small" style="font-weight:600">${branchName}</div>` : ''}

  <div class="sep"></div>

  <!-- DATOS DE LA TRANSACCIÓN -->
  <table><tbody>
    <tr><td class="small">Orden</td><td class="small right">#${order.order_number || '—'}</td></tr>
    <tr><td class="small">Fecha</td><td class="small right">${fecha}</td></tr>
    ${cashierName ? `<tr><td class="small">Cajero</td><td class="small right">${cashierName}</td></tr>` : ''}
    <tr><td class="small">Pago</td><td class="small right">${metodoPago}</td></tr>
  </tbody></table>

  <div class="sep"></div>

  <!-- PRODUCTOS -->
  <table><tbody>${itemRows}</tbody></table>

  <div class="sep"></div>

  <!-- TOTALES -->
  <table class="totals"><tbody>
    ${(discountAmount > 0 || loyaltyDiscount > 0) ? `<tr><td>Subtotal</td><td class="right">${COP(subtotal + discountAmount + loyaltyDiscount)}</td></tr>` : ''}
    ${discountAmount  > 0 ? `<tr><td>Descuento</td><td class="right">-${COP(discountAmount)}</td></tr>` : ''}
    ${loyaltyDiscount > 0 ? `<tr><td>Puntos canjeados</td><td class="right">-${COP(loyaltyDiscount)}</td></tr>` : ''}
    ${taxAmount       > 0 ? `<tr><td>${ivaLabel}</td><td class="right">${COP(taxAmount)}</td></tr>` : ''}
    <tr class="row-total"><td>TOTAL</td><td class="right">${COP(total)}</td></tr>
    ${cashReceived    > 0 ? `<tr><td>Recibido</td><td class="right">${COP(cashReceived)}</td></tr>` : ''}
    ${changeAmount    > 0 ? `<tr class="bold"><td>Vuelto</td><td class="right">${COP(changeAmount)}</td></tr>` : ''}
  </tbody></table>

  ${hasBuyer ? `
  <div class="sep"></div>
  <div class="small bold">FACTURA ELECTRÓNICA — DATOS COMPRADOR</div>
  ${buyerNit   ? `<div class="small">NIT/CC: ${buyerNit}</div>` : ''}
  ${buyerName  ? `<div class="small">Nombre: ${buyerName}</div>` : ''}
  ${buyerEmail ? `<div class="small">Email:  ${buyerEmail}</div>` : ''}
  ${cufe       ? `<div class="small" style="word-break:break-all;font-size:9px">CUFE: ${cufe}</div>` : ''}
  ` : ''}

  <div class="sep"></div>

  <!-- PIE -->
  <div class="center small">¡Gracias por su compra!</div>
  <div class="center small" style="color:#aaa;margin-top:4px">Powered by FERZU POS</div>
  <br/>
</body>
</html>`

  const win = window.open('', '_blank', 'width=340,height=700')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}

export default ThermalPrintButton
