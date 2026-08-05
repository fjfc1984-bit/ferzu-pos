/**
 * FERZU POS — Impresora Térmica ESC/POS
 * Web USB API — funciona con impresoras de 58mm y 80mm
 *
 * Compatibles: Epson TM-T20, XP-58, ZJ-58, PT-210, Bixolon, etc.
 * Requiere: Chrome/Edge en desktop + impresora conectada por USB
 *
 * Uso:
 *   const printer = new ThermalPrinter()
 *   await printer.connect()
 *   await printer.printReceipt({ order, businessName, branchName })
 *   await printer.disconnect()
 */

// ── Comandos ESC/POS ─────────────────────────────────────────────────────────
const ESC = 0x1b
const GS  = 0x1d
const LF  = 0x0a

const CMD = {
  INIT:         [ESC, 0x40],
  ALIGN_LEFT:   [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT:  [ESC, 0x61, 0x02],
  BOLD_ON:      [ESC, 0x45, 0x01],
  BOLD_OFF:     [ESC, 0x45, 0x00],
  DOUBLE_ON:    [GS,  0x21, 0x11],   // Alto x2, ancho x2
  DOUBLE_OFF:   [GS,  0x21, 0x00],
  CUT_FULL:     [GS,  0x56, 0x00],
  CUT_PARTIAL:  [GS,  0x56, 0x01],
  BEEP:         [ESC, 0x42, 0x01, 0x06],
}

const enc = new TextEncoder()

function bytes(...chunks) {
  const parts = chunks.map(c => {
    if (typeof c === 'string') return enc.encode(c)
    return new Uint8Array(c)
  })
  const len = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(len)
  let i = 0
  parts.forEach(p => { out.set(p, i); i += p.length })
  return out
}

function line(text = '') {
  return bytes(text + '\n')
}

function separador(char = '-', width = 32) {
  return line(char.repeat(width))
}

const COP = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

// Padding de texto para alinear dos columnas
function pad2cols(left, right, total = 32) {
  const maxLeft = total - right.length - 1
  return left.slice(0, maxLeft).padEnd(maxLeft) + ' ' + right + '\n'
}

// ── Clase principal ───────────────────────────────────────────────────────────
export class ThermalPrinter {
  constructor({ width = 58 } = {}) {
    this.width    = width            // 58mm → 32 chars | 80mm → 48 chars
    this.charWidth = width >= 80 ? 48 : 32
    this.device   = null
    this.endpoint = null
  }

  get isSupported() {
    return 'usb' in navigator
  }

  async connect() {
    if (!this.isSupported) {
      throw new Error('Web USB no está soportado en este navegador. Usa Chrome o Edge.')
    }

    // Filtros de impresoras térmicas comunes
    const filters = [
      { vendorId: 0x04b8 },   // Epson
      { vendorId: 0x0519 },   // Star
      { vendorId: 0x1504 },   // Bixolon
      { vendorId: 0x0fe6 },   // WinPos / Sewoo
      { vendorId: 0x0483 },   // STMicroelectronics (varios clones chinos)
      { vendorId: 0x154f },   // SNBC
      { vendorId: 0x20d1 },   // Gainscha (GP-58)
      { vendorId: 0x0416 },   // WinBond / ZJ-58
    ]

    try {
      this.device = await navigator.usb.requestDevice({ filters })
      await this.device.open()

      const iface = this.device.configuration.interfaces[0]
      await this.device.claimInterface(iface.interfaceNumber)

      const ep = iface.alternate.endpoints.find(e => e.direction === 'out')
      this.endpoint = ep.endpointNumber

      // Init
      await this._send(CMD.INIT)
      return true
    } catch (err) {
      if (err.name === 'NotFoundError') throw new Error('No se seleccionó ninguna impresora')
      throw err
    }
  }

  async disconnect() {
    if (this.device?.opened) {
      try {
        await this.device.releaseInterface(
          this.device.configuration.interfaces[0].interfaceNumber
        )
        await this.device.close()
      } catch {}
    }
    this.device   = null
    this.endpoint = null
  }

  async _send(data) {
    if (!this.device || !this.endpoint) throw new Error('Impresora no conectada')
    const arr = data instanceof Uint8Array ? data : new Uint8Array(data)
    await this.device.transferOut(this.endpoint, arr)
  }

  // ── Imprimir recibo ─────────────────────────────────────────────────────────
  async printReceipt({ order, businessName, branchName, cashierName, nit }) {
    const W = this.charWidth

    const {
      order_number,
      order_items = [],
      subtotal    = 0,
      discount_amount = 0,
      tax_amount  = 0,
      total       = 0,
      payment_method,
      cash_received,
      change_amount,
      created_at,
    } = order

    const metodoPago = {
      cash:     'Efectivo',
      card:     'Tarjeta',
      bold:     'Bold / Nequi',
      transfer: 'Transferencia',
      split:    'Mixto',
    }[payment_method] || payment_method || '—'

    const fecha = new Date(created_at || Date.now()).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const buf = []

    const push = (...cmds) => cmds.forEach(c => buf.push(c instanceof Uint8Array ? c : new Uint8Array(c)))
    const txt  = (t) => push(enc.encode(t))

    // Header
    push(CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_ON)
    txt(businessName + '\n')
    push(CMD.DOUBLE_OFF)
    if (nit) txt(`NIT: ${nit}\n`)
    if (branchName) txt(branchName + '\n')
    push(CMD.BOLD_OFF)
    txt('================================\n'.slice(0, W + 1))
    txt(`Orden #${order_number || '—'}\n`)
    txt(`${fecha}\n`)
    if (cashierName) txt(`Cajero: ${cashierName}\n`)
    txt('================================\n'.slice(0, W + 1))

    // Items
    push(CMD.ALIGN_LEFT)
    order_items.forEach(item => {
      const itemTotal = COP(item.unit_price * item.quantity)
      txt(pad2cols(`${item.quantity}x ${item.product_name}`, itemTotal, W))
      if (item.quantity > 1) {
        txt(`   c/u ${COP(item.unit_price)}\n`)
      }
    })

    txt('--------------------------------\n'.slice(0, W + 1))

    // Totales
    if (discount_amount > 0) {
      txt(pad2cols('Subtotal:', COP(subtotal), W))
      txt(pad2cols('Descuento:', `-${COP(discount_amount)}`, W))
    }
    if (tax_amount > 0) {
      txt(pad2cols('IVA:', COP(tax_amount), W))
    }

    push(CMD.BOLD_ON)
    txt(pad2cols('TOTAL:', COP(total), W))
    push(CMD.BOLD_OFF)
    txt(pad2cols('Método:', metodoPago, W))

    if (payment_method === 'cash' && cash_received) {
      txt(pad2cols('Recibido:', COP(cash_received), W))
      txt(pad2cols('Cambio:', COP(change_amount || 0), W))
    }

    txt('================================\n'.slice(0, W + 1))

    // Footer
    push(CMD.ALIGN_CENTER)
    txt('¡Gracias por tu compra!\n')
    txt('Powered by FERZU POS\n')
    txt('\n\n\n')

    // Cortar papel
    push(CMD.CUT_PARTIAL)

    // Enviar todo en una sola transferencia
    const total_len = buf.reduce((s, b) => s + b.length, 0)
    const full = new Uint8Array(total_len)
    let i = 0
    buf.forEach(b => { full.set(b, i); i += b.length })

    await this._send(full)
  }

  // ── Imprimir apertura/cierre de caja ───────────────────────────────────────
  async printCashReport({ session, businessName, type = 'close' }) {
    const W = this.charWidth

    const buf = []
    const push = (...cmds) => cmds.forEach(c => buf.push(c instanceof Uint8Array ? c : new Uint8Array(c)))
    const txt  = (t) => push(enc.encode(t))

    push(CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON)
    txt(businessName + '\n')
    push(CMD.BOLD_OFF)
    txt(type === 'open' ? 'APERTURA DE CAJA\n' : 'CIERRE DE CAJA\n')
    txt(new Date().toLocaleString('es-CO') + '\n')
    txt('================================\n'.slice(0, W + 1))

    push(CMD.ALIGN_LEFT)
    txt(pad2cols('Fondo inicial:', COP(session.opening_amount), W))
    if (type === 'close') {
      txt(pad2cols('Ventas efectivo:', COP(session.cash_sales), W))
      txt(pad2cols('Total en caja:', COP(session.closing_amount), W))
      txt(pad2cols('Diferencia:', COP(session.difference), W))
    }
    txt('================================\n'.slice(0, W + 1))
    txt('\n\n\n')
    push(CMD.CUT_PARTIAL)

    const total_len = buf.reduce((s, b) => s + b.length, 0)
    const full = new Uint8Array(total_len)
    let i = 0
    buf.forEach(b => { full.set(b, i); i += b.length })
    await this._send(full)
  }
}

// ── Singleton global ──────────────────────────────────────────────────────────
let _printer = null

export function getPrinter(opts) {
  if (!_printer) _printer = new ThermalPrinter(opts)
  return _printer
}
