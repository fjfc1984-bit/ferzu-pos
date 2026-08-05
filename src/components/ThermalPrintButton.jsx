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
  variant = 'full',
  onDone,
}) {
  const [status, setStatus] = useState('idle')   // idle | connecting | printing | done | error
  const [errMsg, setErrMsg] = useState('')

  const supportsUSB = 'usb' in navigator

  async function handlePrint() {
    if (!supportsUSB) {
      // Fallback: abrir recibo en ventana nueva para imprimir desde el navegador
      printFallback({ order, businessName, branchName, nit })
      if (onDone) onDone()
      return
    }

    setStatus('connecting')
    setErrMsg('')
    const printer = getPrinter()

    try {
      await printer.connect()
      setStatus('printing')
      await printer.printReceipt({ order, businessName, branchName, cashierName, nit })
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
function printFallback({ order, businessName, branchName, nit }) {
  const COP = (n) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

  // IVA label con porcentaje si todos los ítems tienen el mismo rate
  const orderItems = order.order_items || []
  const vatRates   = [...new Set(orderItems.filter(i => i.vat_rate > 0).map(i => i.vat_rate))]
  const ivaLabel   = vatRates.length === 1 ? `IVA ${vatRates[0]}%` : 'IVA'

  const itemRows = orderItems
    .map(i => `<tr>
      <td style="padding:2px 4px">${i.quantity}x ${i.product_name}</td>
      <td style="padding:2px 4px;text-align:right">${COP(i.unit_price * i.quantity)}</td>
    </tr>`)
    .join('')

  const subtotal       = order.subtotal       || 0
  const discountAmount = order.discount_amount || 0
  const taxAmount      = order.tax_amount      || 0
  const total          = order.total           || 0
  const cashReceived   = order.cash_received   || 0
  const changeAmount   = order.change_amount   || 0

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Recibo #${order.order_number || ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .small { font-size: 10px; }
    .sep { border-top: 1px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; }
    .totals td { padding: 1px 4px; }
    .row-total td { font-weight: bold; font-size: 13px; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:14px">${businessName}</div>
  ${nit ? `<div class="center small">${nit}</div>` : ''}
  ${branchName ? `<div class="center small">${branchName}</div>` : ''}
  <div class="sep"></div>
  <div class="small">Orden #${order.order_number || '—'}</div>
  <div class="small">${new Date(order.created_at || Date.now()).toLocaleString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
  <div class="sep"></div>
  <table><tbody>${itemRows}</tbody></table>
  <div class="sep"></div>
  <table class="totals"><tbody>
    ${discountAmount > 0 ? `<tr><td>Subtotal</td><td style="text-align:right">${COP(subtotal)}</td></tr>` : ''}
    ${discountAmount > 0 ? `<tr><td>Descuento</td><td style="text-align:right">-${COP(discountAmount)}</td></tr>` : ''}
    ${taxAmount > 0      ? `<tr><td>${ivaLabel}</td><td style="text-align:right">${COP(taxAmount)}</td></tr>` : ''}
    <tr class="row-total"><td>TOTAL</td><td style="text-align:right">${COP(total)}</td></tr>
    ${cashReceived > 0   ? `<tr><td>Recibido</td><td style="text-align:right">${COP(cashReceived)}</td></tr>` : ''}
    ${changeAmount > 0   ? `<tr class="bold"><td>Vuelto</td><td style="text-align:right">${COP(changeAmount)}</td></tr>` : ''}
  </tbody></table>
  <div class="sep"></div>
  <div class="center small">¡Gracias por su compra!</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=320,height=600')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}

export default ThermalPrintButton
