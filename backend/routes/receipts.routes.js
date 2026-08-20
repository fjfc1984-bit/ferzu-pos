// =============================================================================
// FERZU POS — Ruta: POST /api/receipts/send
//
// Dispara el envío del comprobante de una orden por email y/o WhatsApp.
//
// Request body:
//   {
//     order_id:  "uuid-de-la-orden",
//     channels:  { email: true, whatsapp: true }
//   }
//
// Response 200:
//   {
//     ok: true,
//     results: { email: {messageId}, whatsapp: {wa_id, message_id} }
//   }
// =============================================================================

import express        from 'express'
import { body }       from 'express-validator'
import { supabaseAdmin } from '../config/supabase.js'
import { requireAuth }   from '../middleware/auth.js'
import { validate }      from '../middleware/validate.js'
import { sendReceipt, renderTemplate, buildReceiptPayload } from '../services/receipt.service.js'
import logger            from '../config/logger.js'

const router = express.Router()
router.use(requireAuth)

// POST /api/receipts/send
router.post('/send', [
  body('order_id').isUUID().withMessage('order_id debe ser un UUID válido'),
  body('channels').isObject().withMessage('channels debe ser un objeto'),
  body('channels.email').optional().isBoolean(),
  body('channels.whatsapp').optional().isBoolean(),
  validate,
], async (req, res) => {
  try {
    const { order_id, channels = { email: true, whatsapp: false } } = req.body
    const organizationId = req.organizationId  // siempre del JWT, nunca del body

    // ── 1. Cargar la orden con sus ítems ──────────────────────────────────────
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, created_at, total_amount, total_discounts,
        total_cash, total_card, total_nequi, total_daviplata, total_transfers,
        status, cashier_name,
        items:order_items(
          product_name, quantity, unit_price, vat_rate, vat_included, description
        )
      `)
      .eq('id', order_id)
      .eq('organization_id', organizationId)   // anti cross-tenant
      .single()

    if (orderErr || !order) {
      return res.status(404).json({ error: 'Orden no encontrada o sin acceso' })
    }

    // ── 2. Cargar el cliente (si existe) ──────────────────────────────────────
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('full_name, id_type, id_number, email, phone')
      .eq('id', order.customer_id || '')
      .eq('organization_id', organizationId)
      .maybeSingle()

    // ── 3. Cargar configuración del negocio ───────────────────────────────────
    const { data: empresa, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select(`
        name, nit, tax_regime, address, city, phone, email, support_email,
        logo_url, instagram, whatsapp_number
      `)
      .eq('id', organizationId)
      .single()

    if (orgErr || !empresa) {
      return res.status(500).json({ error: 'No se pudo cargar la configuración del negocio' })
    }

    // ── 4. Orquestar envío ────────────────────────────────────────────────────
    // Si el cliente no tiene email en BD, usar el que envió el frontend
    const { override_email } = req.body
    if (override_email && customer && !customer.email) {
      customer.email = override_email
    } else if (override_email && !customer) {
      // Cliente anónimo: crear objeto mínimo con el email
      customer = { full_name: 'Consumidor Final', email: override_email, phone: null }
    }

    const { results } = await sendReceipt({ order, customer, empresa, channels })

    // ── 5. Registrar en auditoría ─────────────────────────────────────────────
    logger.info(`[receipts] Comprobante ${order_id} enviado`, {
      organizationId,
      channels,
      email_ok:    !results.email?.error,
      whatsapp_ok: !results.whatsapp?.error,
    })

    res.json({ ok: true, results })

  } catch (err) {
    logger.error('[receipts] Error inesperado:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// =============================================================================
// GET /api/receipts/view/:orderId
//
// Endpoint PÚBLICO — renderiza la factura HTML de una orden.
// No requiere autenticación: el UUID de la orden actúa como token de acceso.
// El UUID v4 tiene 2^122 combinaciones posibles → imposible de adivinar.
//
// Uso en WhatsApp/email: https://<backend>/api/receipts/view/<uuid>
// =============================================================================

router.get('/view/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params

    // Validar que sea un UUID
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(orderId)) {
      return res.status(400).send('<h2>ID de orden inválido</h2>')
    }

    // ── 1. Cargar la orden ────────────────────────────────────────────────────
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, created_at, total_amount, total_discounts,
        total_cash, total_card, total_nequi, total_daviplata, total_transfers,
        status, cashier_name, organization_id, customer_id,
        items:order_items(
          product_name, quantity, unit_price, vat_rate, vat_included, description
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      return res.status(404).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>🔍 Factura no encontrada</h2>
          <p>El enlace puede haber expirado o la orden no existe.</p>
        </body></html>
      `)
    }

    // ── 2. Cargar cliente (si existe) ─────────────────────────────────────────
    let customer = null
    if (order.customer_id) {
      const { data } = await supabaseAdmin
        .from('customers')
        .select('full_name, id_type, id_number, email, phone')
        .eq('id', order.customer_id)
        .eq('organization_id', order.organization_id)
        .maybeSingle()
      customer = data
    }

    // ── 3. Cargar configuración del negocio ───────────────────────────────────
    const { data: empresa, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select(`
        name, nit, tax_regime, address, city, phone, email, support_email,
        logo_url, instagram, whatsapp_number
      `)
      .eq('id', order.organization_id)
      .single()

    if (orgErr || !empresa) {
      return res.status(500).send('<h2>Error cargando datos del negocio</h2>')
    }

    // ── 4. Renderizar y devolver el HTML ──────────────────────────────────────
    const payload = buildReceiptPayload(order, customer, empresa)
    const html    = renderTemplate(payload)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600') // cacheable 1h
    res.send(html)

  } catch (err) {
    logger.error('[receipts/view] Error:', err.message)
    res.status(500).send('<h2>Error interno del servidor</h2>')
  }
})

export default router
