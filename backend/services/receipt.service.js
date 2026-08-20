// =============================================================================
// FERZU POS — Servicio de Comprobantes de Venta
//
// Responsabilidades:
//   1. Renderizar la plantilla HTML con los datos de la orden
//   2. Enviar el comprobante por correo (Nodemailer)
//   3. Enviar el comprobante por WhatsApp (Meta Cloud API)
//
// Variables de entorno requeridas (backend/.env):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//   WA_PHONE_ID        — ID del número de WhatsApp Business
//   WA_ACCESS_TOKEN    — Token de acceso permanente (Meta)
//   WA_TEMPLATE_NAME   — Nombre del template aprobado (default: "comprobante_venta")
// =============================================================================

// Email: usa Resend (ya instalado en el proyecto).
// Alternativa: Nodemailer → instalar con: npm install nodemailer
import { Resend }        from 'resend'
import fs                from 'fs'
import path              from 'path'
import { fileURLToPath } from 'url'
import logger            from '../config/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formatea un número como pesos colombianos.
 * Ej: 75000 → "$ 75.000"
 */
function formatCOP(value) {
  const num = Number(value) || 0
  return '$ ' + num.toLocaleString('es-CO')
}

/**
 * Renderiza la plantilla HTML con los datos del comprobante.
 * Reemplaza tokens {{variable}} y bloques {{#if}} / {{#each}} básicos.
 * Para producción considera Handlebars o EJS si la plantilla crece.
 */
export function renderTemplate(data) {
  const templatePath = path.join(__dirname, '../templates/receipt.html')
  let html = fs.readFileSync(templatePath, 'utf-8')

  // Reemplazar {{formatCOP variable}} → valor formateado
  html = html.replace(/\{\{formatCOP\s+([\w.]+)\}\}/g, (_, key) => {
    const val = getNestedValue(data, key)
    return formatCOP(val)
  })

  // Reemplazar {{#if campo}} ... {{/if}} condicionales
  html = html.replace(/\{\{#if ([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, content) => {
    const val = getNestedValue(data, key)
    return val ? content : ''
  })

  // Reemplazar {{#each items}} ... {{/each}} (lista de productos)
  html = html.replace(/\{\{#each items\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, rowTemplate) => {
    return (data.items || []).map((item, idx) => {
      let row = rowTemplate
      row = row.replace(/\{\{#if @even\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (_, even, odd) => idx % 2 === 0 ? even : odd)
      row = row.replace(/\{\{#if descripcion\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (_, content) => item.descripcion ? content : '')
      row = row.replace(/\{\{nombre\}\}/g,         item.nombre       || '')
      row = row.replace(/\{\{descripcion\}\}/g,    item.descripcion  || '')
      row = row.replace(/\{\{cantidad\}\}/g,        String(item.cantidad || 1))
      row = row.replace(/\{\{formatCOP valor_unitario\}\}/g, formatCOP(item.valor_unitario))
      row = row.replace(/\{\{formatCOP total\}\}/g,          formatCOP(item.total))
      return row
    }).join('')
  })

  // Reemplazar {{#each pagos}} ... {{/each}}
  html = html.replace(/\{\{#each pagos\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, rowTemplate) => {
    return (data.pagos || []).map(pago => {
      let row = rowTemplate
      row = row.replace(/\{\{metodo\}\}/g,              pago.metodo  || '')
      row = row.replace(/\{\{formatCOP monto\}\}/g, formatCOP(pago.monto))
      return row
    }).join('')
  })

  // Reemplazar variables simples {{campo.subcampo}}
  html = html.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const val = getNestedValue(data, key)
    return val !== undefined && val !== null ? String(val) : ''
  })

  return html
}

/** Acceso seguro a propiedades anidadas (ej: "empresa.nombre") */
function getNestedValue(obj, keyPath) {
  return keyPath.split('.').reduce((acc, k) => acc?.[k], obj)
}

// =============================================================================
// 1. ARQUITECTURA DE DATOS — Schema del comprobante
// =============================================================================

/**
 * buildReceiptPayload(order, customer, empresa)
 *
 * Construye el objeto JSON completo del comprobante a partir de los
 * datos normalizados de la BD. Este es el contrato entre el frontend/
 * backend y el servicio de envío.
 *
 * @param {Object} order   — Fila de la tabla orders (con items)
 * @param {Object} customer — Datos del cliente (tabla customers)
 * @param {Object} empresa  — Configuración del negocio (tabla organizations)
 * @returns {Object} payload listo para renderTemplate() y enviar
 */
export function buildReceiptPayload(order, customer, empresa) {
  // ── Calcular totales ────────────────────────────────────────────────────────
  const subtotal  = order.items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0)
  const descuento = order.total_discounts || 0
  const iva       = order.items.reduce((sum, i) => {
    if (!i.vat_included && i.vat_rate > 0) {
      return sum + (i.unit_price * i.quantity * (i.vat_rate / 100))
    }
    return sum
  }, 0)

  // ── Mapear métodos de pago ───────────────────────────────────────────────────
  const METODO_LABELS = {
    cash:       '💵 Efectivo',
    card:       '💳 Tarjeta débito/crédito',
    nequi:      '📱 Nequi',
    daviplata:  '📱 Daviplata',
    transfer:   '🏦 Transferencia bancaria',
  }

  const pagos = []
  if (order.total_cash   > 0) pagos.push({ metodo: METODO_LABELS.cash,      monto: order.total_cash })
  if (order.total_card   > 0) pagos.push({ metodo: METODO_LABELS.card,      monto: order.total_card })
  if (order.total_nequi  > 0) pagos.push({ metodo: METODO_LABELS.nequi,     monto: order.total_nequi })
  if (order.total_daviplata > 0) pagos.push({ metodo: METODO_LABELS.daviplata, monto: order.total_daviplata })
  if (order.total_transfers > 0) pagos.push({ metodo: METODO_LABELS.transfer, monto: order.total_transfers })

  // ── Construir el payload ────────────────────────────────────────────────────
  return {
    // Metadatos de envío
    meta: {
      order_id:    order.id,
      generado_en: new Date().toISOString(),
      canal:       'ferzu-pos',
      receipt_url: (() => {
        const base = process.env.RECEIPT_BASE_URL
          || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
          || 'https://ferzu-backend-production.up.railway.app'
        return `${base}/api/receipts/view/${order.id}`
      })(),
    },

    // Datos del emisor (el negocio)
    empresa: {
      nombre:        empresa.name,
      nit:           empresa.nit                || 'Sin NIT registrado',
      regimen:       empresa.tax_regime         || 'No responsable de IVA',
      direccion:     empresa.address            || '',
      ciudad:        empresa.city               || 'Colombia',
      telefono:      empresa.phone              || '',
      email_soporte: empresa.support_email      || empresa.email || '',
      logo_url:      empresa.logo_url           || null,
      redes: {
        instagram: empresa.instagram            || null,
        whatsapp:  empresa.whatsapp_number      || empresa.phone || null,
      },
    },

    // Datos de la orden
    orden: {
      numero: `#ORD-${String(order.order_number || order.id?.slice(-4)).padStart(4, '0')}`,
      fecha:  new Date(order.created_at).toLocaleDateString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      }),
      cajero: order.cashier_name || 'Sistema',
    },

    // Datos del cliente
    cliente: {
      nombre:    customer?.full_name    || 'Consumidor Final',
      tipo_id:   customer?.id_type      || 'CC',
      numero_id: customer?.id_number    || 'Sin identificación',
      email:     customer?.email        || '',
      celular:   customer?.phone        || '',
    },

    // Líneas de producto
    items: (order.items || []).map(item => ({
      nombre:        item.product_name || item.name,
      descripcion:   item.description  || null,
      cantidad:      item.quantity,
      valor_unitario: item.unit_price,
      total:         item.unit_price * item.quantity,
      vat_rate:      item.vat_rate     || 0,
    })),

    // Desglose financiero
    totales: {
      subtotal,
      descuento:  descuento > 0 ? descuento : null,
      iva:        iva > 0 ? iva : null,
      iva_pct:    19,  // porcentaje de IVA aplicado (si aplica)
      total:      order.total_amount,
    },

    // Métodos de pago usados
    pagos,
  }
}

// =============================================================================
// 2. ENVÍO POR CORREO — Resend (ya instalado en el proyecto)
//
// Variable de entorno requerida:
//   RESEND_API_KEY  — Obtener en https://resend.com/api-keys
//   EMAIL_FROM      — Ej: "FERZU POS <no-reply@ferzu-pos.com>"
//                     (el dominio debe estar verificado en Resend)
// =============================================================================

/**
 * sendReceiptByEmail(payload, toEmail)
 *
 * Renderiza el HTML y lo envía como cuerpo del correo usando Resend.
 * El HTML inline CSS es compatible con Gmail, Outlook y Apple Mail.
 *
 * @param {Object} payload — Resultado de buildReceiptPayload()
 * @param {string} toEmail — Correo destino del cliente
 * @returns {Promise<{id: string}>}
 */
export async function sendReceiptByEmail(payload, toEmail) {
  if (!toEmail) throw new Error('Email del cliente requerido para enviar comprobante')
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurado en variables de entorno')

  const resend = new Resend(process.env.RESEND_API_KEY)
  const html   = renderTemplate(payload)

  const { data, error } = await resend.emails.send({
    from:    process.env.EMAIL_FROM || `${payload.empresa.nombre} <onboarding@resend.dev>`,
    to:      [toEmail],
    subject: `✅ Tu comprobante ${payload.orden.numero} — ${payload.empresa.nombre}`,
    html,
    // Texto plano como fallback
    text: (() => {
      const backendUrl = process.env.RECEIPT_BASE_URL
        || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
        || 'https://ferzu-backend-production.up.railway.app'
      const link = `${backendUrl}/api/receipts/view/${payload.meta.order_id}`
      return [
        `Hola ${payload.cliente.nombre},`,
        `Gracias por tu compra en ${payload.empresa.nombre}.`,
        `Orden: ${payload.orden.numero} | Fecha: ${payload.orden.fecha}`,
        `Total: ${formatCOP(payload.totales.total)}`,
        `Ver factura digital: ${link}`,
        `Soporte: ${payload.empresa.telefono}`,
      ].join('\n')
    })(),
    // Tags para filtrar en el dashboard de Resend
    tags: [
      { name: 'order_id',      value: payload.meta.order_id },
      { name: 'organization',  value: payload.empresa.nombre },
    ],
  })

  if (error) {
    logger.error('[Receipt] Resend error:', error)
    throw new Error(`Resend error: ${error.message}`)
  }

  logger.info(`[Receipt] Email enviado a ${toEmail} — ID: ${data.id}`)
  return { id: data.id }
}

// ─── Alternativa con Nodemailer (SMTP) ───────────────────────────────────────
// Si prefieres SMTP (Gmail, Mailtrap, etc.) instala nodemailer:
//   npm install nodemailer   (en /backend)
// Y reemplaza sendReceiptByEmail con:
//
// import nodemailer from 'nodemailer'
// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST, port: 587, secure: false,
//   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
// })
// await transporter.sendMail({
//   from: `"${payload.empresa.nombre}" <${process.env.SMTP_USER}>`,
//   to: toEmail, subject: `Comprobante ${payload.orden.numero}`, html,
// })
// ─────────────────────────────────────────────────────────────────────────────

// =============================================================================
// 3. ENVÍO POR WHATSAPP — Meta Cloud API
// =============================================================================

/**
 * sendReceiptByWhatsApp(payload, toPhone)
 *
 * Estrategia de envío:
 *   OPCIÓN A — Template aprobado (requiere pre-aprobación en Meta Business):
 *     Envía un template con variables (nombre, orden, total) más un link
 *     al comprobante en línea (o un PDF en el botón de CTA).
 *
 *   OPCIÓN B — Mensaje de texto libre (solo para conversaciones iniciadas
 *     por el cliente en las últimas 24h):
 *     Envía el resumen en texto plano con emoji.
 *
 * Esta función implementa OPCIÓN A (recomendada para producción).
 *
 * Variables de entorno requeridas:
 *   WA_PHONE_ID      — Ej: "123456789012345"
 *   WA_ACCESS_TOKEN  — Token permanente de sistema
 *   WA_TEMPLATE_NAME — Nombre exacto del template aprobado
 *   RECEIPT_BASE_URL — URL pública donde servir el comprobante (Ej: https://ferzu-pos.vercel.app)
 *
 * @param {Object} payload — Resultado de buildReceiptPayload()
 * @param {string} toPhone — Número del cliente (formato: 573001234567)
 * @returns {Promise<{wa_id: string, message_id: string}>}
 */
export async function sendReceiptByWhatsApp(payload, toPhone) {
  if (!toPhone) throw new Error('Celular del cliente requerido para enviar por WhatsApp')

  const phoneId     = process.env.WA_PHONE_ID
  const accessToken = process.env.WA_ACCESS_TOKEN
  const templateName = process.env.WA_TEMPLATE_NAME || 'comprobante_venta'

  if (!phoneId || !accessToken) {
    throw new Error('WA_PHONE_ID y WA_ACCESS_TOKEN son requeridos en las variables de entorno')
  }

  // Normalizar número: quitar '+', '0', espacios y asegurar código 57
  const normalizedPhone = toPhone.replace(/[\s+\-()]/g, '').replace(/^0/, '')
  const fullPhone = normalizedPhone.startsWith('57') ? normalizedPhone : `57${normalizedPhone}`

  // URL pública del comprobante — endpoint GET /api/receipts/view/:orderId
  const backendUrl = process.env.RECEIPT_BASE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    || 'https://ferzu-backend-production.up.railway.app'
  const receiptUrl = `${backendUrl}/api/receipts/view/${payload.meta.order_id}`

  // ─── Cuerpo de la petición: Template Message ────────────────────────────────
  //
  // El template "comprobante_venta" debe estar aprobado en Meta Business Suite.
  // Estructura del template (crearla en Meta):
  //
  //   HEADER: Imagen (logo del negocio) — opcional
  //   BODY:
  //     "Hola {{1}}, aquí está tu comprobante {{2}} de {{3}} por un total de *{{4}}*.
  //      Fecha: {{5}}"
  //   FOOTER: "FERZU POS — Tu aliado de ventas"
  //   BUTTONS: [CTA URL] "Ver comprobante" → {{6}}
  //
  const body = {
    messaging_product: 'whatsapp',
    to:   fullPhone,
    type: 'template',
    template: {
      name:     templateName,
      language: { code: 'es_CO' },
      components: [
        // Imagen de cabecera (logo) — opcional
        // {
        //   type: 'header',
        //   parameters: [{
        //     type: 'image',
        //     image: { link: payload.empresa.logo_url }
        //   }]
        // },

        // Variables del BODY del template
        {
          type: 'body',
          parameters: [
            { type: 'text', text: payload.cliente.nombre },              // {{1}} Nombre cliente
            { type: 'text', text: payload.orden.numero },                 // {{2}} Número orden
            { type: 'text', text: payload.empresa.nombre },               // {{3}} Empresa
            { type: 'text', text: formatCOP(payload.totales.total) },     // {{4}} Total
            { type: 'text', text: payload.orden.fecha },                  // {{5}} Fecha
          ],
        },

        // Botón CTA dinámico con URL del comprobante
        {
          type:       'button',
          sub_type:   'url',
          index:      '0',
          parameters: [
            { type: 'text', text: payload.meta.order_id },                // sufijo de la URL
          ],
        },
      ],
    },
  }

  // ─── Petición a la API de Meta ──────────────────────────────────────────────
  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneId}/messages`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    logger.error('[Receipt] Error WhatsApp API:', errorData)
    throw new Error(`WhatsApp API error ${response.status}: ${errorData?.error?.message || response.statusText}`)
  }

  const result = await response.json()
  logger.info(`[Receipt] WhatsApp enviado a ${fullPhone} — WA_ID: ${result.contacts?.[0]?.wa_id}`)

  return {
    wa_id:      result.contacts?.[0]?.wa_id,
    message_id: result.messages?.[0]?.id,
  }
}

/**
 * sendReceiptByWhatsAppText(payload, toPhone)
 *
 * OPCIÓN B — Texto libre (solo si hay sesión activa del cliente en 24h).
 * Útil para pruebas o cuando no tienes template aprobado.
 */
export async function sendReceiptByWhatsAppText(payload, toPhone) {
  const phoneId     = process.env.WA_PHONE_ID
  const accessToken = process.env.WA_ACCESS_TOKEN

  const normalizedPhone = toPhone.replace(/[\s+\-()]/g, '').replace(/^0/, '')
  const fullPhone = normalizedPhone.startsWith('57') ? normalizedPhone : `57${normalizedPhone}`

  // Enlace público al comprobante HTML
  const backendUrl = process.env.RECEIPT_BASE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    || 'https://ferzu-backend-production.up.railway.app'
  const receiptUrl = `${backendUrl}/api/receipts/view/${payload.meta.order_id}`

  const textBody = [
    `✅ *Comprobante de Venta*`,
    `*${payload.empresa.nombre}*`,
    `NIT: ${payload.empresa.nit}`,
    `─────────────────`,
    `📋 Orden: ${payload.orden.numero}`,
    `📅 Fecha: ${payload.orden.fecha}`,
    `👤 Cliente: ${payload.cliente.nombre}`,
    `─────────────────`,
    ...payload.items.map(i => `• ${i.nombre} x${i.cantidad} — ${formatCOP(i.total)}`),
    `─────────────────`,
    payload.totales.descuento ? `🏷️ Descuento: -${formatCOP(payload.totales.descuento)}` : null,
    `*💰 TOTAL: ${formatCOP(payload.totales.total)}*`,
    `─────────────────`,
    `🧾 Ver tu factura digital:`,
    receiptUrl,
    `📞 Soporte: ${payload.empresa.telefono}`,
    `_Gracias por tu compra_ 🙌`,
  ].filter(Boolean).join('\n')

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneId}/messages`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   fullPhone,
        type: 'text',
        text: { body: textBody, preview_url: false },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`WhatsApp API error ${response.status}: ${err?.error?.message}`)
  }

  return response.json()
}

// =============================================================================
// 4. FUNCIÓN PRINCIPAL — Orquestador de envíos
// =============================================================================

/**
 * sendReceipt({ order, customer, empresa, channels })
 *
 * Orquesta el envío del comprobante por los canales solicitados.
 * Cada canal falla de forma independiente (no bloquea los otros).
 *
 * @param {Object} order    — Orden de la BD
 * @param {Object} customer — Cliente (puede ser null → "Consumidor Final")
 * @param {Object} empresa  — Configuración del negocio
 * @param {Object} channels — { email: bool, whatsapp: bool }
 *
 * @returns {Object} { payload, results: { email, whatsapp } }
 */
export async function sendReceipt({ order, customer, empresa, channels = {} }) {
  const payload = buildReceiptPayload(order, customer, empresa)
  const results = {}

  // Envío por email
  if (channels.email && customer?.email) {
    try {
      results.email = await sendReceiptByEmail(payload, customer.email)
    } catch (err) {
      logger.error('[Receipt] Error enviando email:', err.message)
      results.email = { error: err.message }
    }
  }

  // Envío por WhatsApp
  if (channels.whatsapp && customer?.phone) {
    try {
      results.whatsapp = await sendReceiptByWhatsApp(payload, customer.phone)
    } catch (err) {
      logger.error('[Receipt] Error enviando WhatsApp:', err.message)
      results.whatsapp = { error: err.message }
    }
  }

  return { payload, results }
}
