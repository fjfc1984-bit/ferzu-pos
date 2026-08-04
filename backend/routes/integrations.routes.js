// =============================================================================
// FERZU POS — Integrations Routes
// F4: Hub de integraciones externas
//
// Webhooks delivery:  POST /webhooks/rappi | /webhooks/ubereats | /webhooks/didi
// Exports contables:  GET  /api/integrations/export/siigo | /export/generic
// Config:             GET/PATCH /api/integrations/settings
// =============================================================================
import express  from 'express';
import crypto   from 'crypto';
import { body, query } from 'express-validator';
import { supabaseAdmin }        from '../config/supabase.js';
import logger                    from '../config/logger.js';
import { requireAuth, requireRole, assertBranchOwnership } from '../middleware/auth.js';
import { validate }              from '../middleware/validate.js';

const router = express.Router();

// =============================================================================
// SECCIÓN 1 — WEBHOOKS DE PLATAFORMAS DE DELIVERY
// Montado en /webhooks/rappi, /webhooks/ubereats, /webhooks/didi
// NO requieren autenticación JWT — se validan con firma HMAC
// =============================================================================

/**
 * Valida firma HMAC-SHA256 del webhook.
 * Cada plataforma usa su propio header y algoritmo.
 */
function verifyHmac(secret, payload, signature, algorithm = 'sha256') {
  if (!secret) return false; // sin secret configurado → rechazar
  const computed = crypto.createHmac(algorithm, secret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Normaliza un pedido de cualquier plataforma al formato de orden FERZU POS.
 * Retorna { branch_id, items, customer, metadata, total_hint }
 */
function normalizePlatformOrder(platform, rawOrder) {
  // Cada plataforma tiene su propio schema — aquí se adaptan los más comunes.
  // En producción, completar con el schema exacto de cada API.
  switch (platform) {
    case 'rappi': {
      return {
        customer_name: rawOrder.user_info?.name || 'Cliente Rappi',
        customer_phone: rawOrder.user_info?.phone || null,
        delivery_address: rawOrder.delivery?.address || '',
        delivery_fee: rawOrder.delivery?.cost || 0,
        platform_order_id: rawOrder.id || rawOrder.order_id,
        items: (rawOrder.order_detail || rawOrder.items || []).map(i => ({
          name:       i.product?.name || i.name,
          quantity:   i.quantity || 1,
          unit_price: i.unit_price || i.price || 0,
          sku:        i.product?.sku || i.sku || null,
        })),
        platform_total: rawOrder.total_order || rawOrder.total || 0,
      };
    }
    case 'ubereats': {
      return {
        customer_name: rawOrder.customer?.name || 'Cliente UberEats',
        customer_phone: rawOrder.customer?.phone || null,
        delivery_address: rawOrder.deliveryAddress?.address || '',
        delivery_fee: rawOrder.delivery?.price?.unitPrice || 0,
        platform_order_id: rawOrder.id,
        items: (rawOrder.cart?.items || []).map(i => ({
          name:       i.title || i.name,
          quantity:   i.quantity || 1,
          unit_price: (i.price?.unitPrice || 0) / 100, // UberEats en centavos
          sku:        i.id || null,
        })),
        platform_total: (rawOrder.price?.total || 0) / 100,
      };
    }
    case 'didi': {
      return {
        customer_name: rawOrder.user?.name || 'Cliente DiDi Food',
        customer_phone: rawOrder.user?.phone || null,
        delivery_address: rawOrder.address?.detail || '',
        delivery_fee: rawOrder.delivery_fee || 0,
        platform_order_id: rawOrder.order_no || rawOrder.id,
        items: (rawOrder.product_list || rawOrder.items || []).map(i => ({
          name:       i.product_name || i.name,
          quantity:   i.count || i.quantity || 1,
          unit_price: i.price || 0,
          sku:        i.product_id || null,
        })),
        platform_total: rawOrder.total_fee || rawOrder.total || 0,
      };
    }
    default:
      return null;
  }
}

/**
 * Crea la orden en Supabase a partir del pedido normalizado.
 * Usa el primer branch habilitado para delivery de la organización.
 */
async function createDeliveryOrder(organizationId, platform, normalized) {
  // Buscar branch configurado para delivery de esta plataforma
  const { data: orgMeta } = await supabaseAdmin
    .from('organizations')
    .select('metadata')
    .eq('id', organizationId)
    .single();

  const branchId = orgMeta?.metadata?.integrations?.[platform]?.branch_id;
  if (!branchId) {
    logger.warn(`[WEBHOOK:${platform}] No hay branch_id configurado para esta plataforma`);
    return null;
  }

  // Buscar o crear cliente delivery
  let customerId = null;
  if (normalized.customer_phone) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone', normalized.customer_phone)
      .maybeSingle();
    customerId = customer?.id || null;

    if (!customerId) {
      const { data: newCustomer } = await supabaseAdmin
        .from('customers')
        .insert({
          organization_id: organizationId,
          name:            normalized.customer_name,
          phone:           normalized.customer_phone,
          notes:           `Creado automáticamente vía ${platform}`,
        })
        .select('id')
        .single();
      customerId = newCustomer?.id || null;
    }
  }

  // Generar número de orden
  const { data: orderNumData } = await supabaseAdmin
    .rpc('generate_order_number', { p_branch_id: branchId });
  const order_number = orderNumData || `DEL-${Date.now()}`;

  // Calcular totales (el backend siempre calcula — items vienen con precios de plataforma)
  const subtotal = normalized.items.reduce((s, i) => s + Math.round(i.unit_price * i.quantity), 0);
  const total    = subtotal + Math.round(normalized.delivery_fee || 0);

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .insert({
      branch_id:       branchId,
      organization_id: organizationId,  // RLS
      order_type:      'delivery',
      order_number,
      customer_id:     customerId,
      subtotal,
      tax_total:       0,
      discount_amount: 0,
      total,
      status:          'open',
      metadata: {
        platform,
        platform_order_id: normalized.platform_order_id,
        delivery_address:  normalized.delivery_address,
        delivery_fee:      normalized.delivery_fee,
        platform_total:    normalized.platform_total,
      },
    })
    .select('id, order_number')
    .single();

  if (error) { logger.error(`[WEBHOOK:${platform}] Error creando orden`, { error }); return null; }

  // Insertar items como order_items simples (sin product_id — delivery usa nombres libres)
  if (normalized.items.length > 0) {
    await supabaseAdmin.from('order_items').insert(
      normalized.items.map(i => ({
        order_id:     order.id,
        product_name: i.name,
        quantity:     i.quantity,
        unit_price:   Math.round(i.unit_price),
        subtotal:     Math.round(i.unit_price * i.quantity),
        vat_rate:     0,
        vat_amount:   0,
        discount_amount: 0,
      }))
    );
  }

  logger.info(`[WEBHOOK:${platform}] Orden creada`, { orderId: order.id, orderNumber: order.order_number });
  return order;
}

// ── Webhook Rappi ──────────────────────────────────────────────────────────────
export async function handleRappiWebhook(req, res) {
  const secret    = process.env.RAPPI_WEBHOOK_SECRET;
  const signature = req.headers['x-rappi-signature'] || '';
  const rawBody   = req.rawBody || JSON.stringify(req.body);

  if (secret && !verifyHmac(secret, rawBody, signature.replace('sha256=', ''))) {
    logger.warn('[WEBHOOK:rappi] Firma inválida');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { organizationId } = req;
  const normalized = normalizePlatformOrder('rappi', req.body);
  if (!normalized) return res.status(400).json({ error: 'Orden no reconocida' });

  const order = await createDeliveryOrder(organizationId, 'rappi', normalized);
  res.json({ received: true, order_id: order?.id || null });
}

// ── Webhook UberEats ───────────────────────────────────────────────────────────
export async function handleUberEatsWebhook(req, res) {
  const secret    = process.env.UBEREATS_WEBHOOK_SECRET;
  const signature = req.headers['x-uber-signature'] || '';
  const rawBody   = req.rawBody || JSON.stringify(req.body);

  if (secret && !verifyHmac(secret, rawBody, signature)) {
    logger.warn('[WEBHOOK:ubereats] Firma inválida');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const normalized = normalizePlatformOrder('ubereats', req.body);
  if (!normalized) return res.status(400).json({ error: 'Orden no reconocida' });

  const order = await createDeliveryOrder(req.organizationId, 'ubereats', normalized);
  res.json({ received: true, order_id: order?.id || null });
}

// ── Webhook DiDi Food ─────────────────────────────────────────────────────────
export async function handleDidiWebhook(req, res) {
  const secret    = process.env.DIDI_WEBHOOK_SECRET;
  const signature = req.headers['x-didi-signature'] || '';
  const rawBody   = req.rawBody || JSON.stringify(req.body);

  if (secret && !verifyHmac(secret, rawBody, signature)) {
    logger.warn('[WEBHOOK:didi] Firma inválida');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const normalized = normalizePlatformOrder('didi', req.body);
  if (!normalized) return res.status(400).json({ error: 'Orden no reconocida' });

  const order = await createDeliveryOrder(req.organizationId, 'didi', normalized);
  res.json({ received: true, order_id: order?.id || null });
}

// =============================================================================
// SECCIÓN 2 — ENDPOINTS AUTENTICADOS  /api/integrations/...
// =============================================================================
router.use(requireAuth);

// ─── GET /api/integrations/settings — Configuración actual de integraciones ──
router.get('/settings', async (req, res) => {
  try {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('metadata')
      .eq('id', req.organizationId)
      .single();

    const integrations = org?.metadata?.integrations || {};
    // Ocultar secrets — solo devolver estado y branch_id
    const safe = {};
    for (const [platform, cfg] of Object.entries(integrations)) {
      safe[platform] = {
        enabled:   cfg.enabled || false,
        branch_id: cfg.branch_id || null,
        configured: Boolean(cfg.secret_hash),  // true si hay secret guardado
      };
    }
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/integrations/settings — Guardar configuración ─────────────────
router.patch('/settings', [
  requireRole('admin', 'owner'),
  body('platform').isIn(['rappi', 'ubereats', 'didi']),
  body('branch_id').optional().isUUID(),
  body('enabled').optional().isBoolean(),
  body('webhook_secret').optional().isString(),
  validate,
], async (req, res) => {
  try {
    const { platform, branch_id, enabled, webhook_secret } = req.body;

    if (branch_id) await assertBranchOwnership(branch_id, req.organizationId);

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('metadata')
      .eq('id', req.organizationId)
      .single();

    const current = org?.metadata || {};
    const currentIntegrations = current.integrations || {};
    const existing = currentIntegrations[platform] || {};

    const updated = {
      ...existing,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(branch_id ? { branch_id } : {}),
      ...(webhook_secret ? { secret_hash: crypto.createHash('sha256').update(webhook_secret).digest('hex') } : {}),
    };

    const { error } = await supabaseAdmin
      .from('organizations')
      .update({
        metadata: {
          ...current,
          integrations: { ...currentIntegrations, [platform]: updated },
        },
      })
      .eq('id', req.organizationId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// SECCIÓN 3 — EXPORTACIÓN CONTABLE
// =============================================================================

function formatCOPRaw(n) {
  return Math.round(Number(n) || 0).toString();
}

function fmtDate(iso) {
  if (!iso) return '';
  return iso.split('T')[0];
}

function escapeCsv(val) {
  const s = String(val ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

// ─── GET /api/integrations/export/siigo ───────────────────────────────────────
// CSV compatible con Siigo (Colombia) — formato facturas de venta
router.get('/export/siigo', [
  requireRole('admin', 'owner'),
  query('date_from').isDate(),
  query('date_to').isDate(),
  validate,
], async (req, res) => {
  try {
    const { date_from, date_to, branch_id } = req.query;

    if (branch_id) await assertBranchOwnership(branch_id, req.organizationId);

    const dayStart = `${date_from}T05:00:00.000Z`;
    const nextDate = new Date(date_to);
    nextDate.setDate(nextDate.getDate() + 1);
    const dayEnd = `${nextDate.toISOString().split('T')[0]}T05:00:00.000Z`;

    let q = supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, created_at, total, subtotal, tax_total,
        discount_amount, payment_method,
        customers(name, document_number, phone),
        order_items(product_name, quantity, unit_price, vat_rate, subtotal)
      `)
      .eq('organization_id', req.organizationId)
      .eq('status', 'completed')
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd)
      .order('created_at');

    if (branch_id) q = q.eq('branch_id', branch_id);

    const { data: orders, error } = await q;
    if (error) throw error;

    // Cabecera Siigo
    const header = [
      'TipoDocumento', 'PrefijoDOcumento', 'NúmeroDocumento', 'FechaDocumento',
      'NIT_Cliente', 'NombreCliente', 'DescripciónProducto',
      'Cantidad', 'ValorUnitario', 'Descuento', 'Subtotal',
      'IVA_Pct', 'IVA_Valor', 'Total', 'FormaPago',
    ].map(escapeCsv).join(',');

    const rows = [];
    for (const ord of orders) {
      const clientName = ord.customers?.name || 'Consumidor Final';
      const nit        = ord.customers?.document_number || '222222222';
      const dateStr    = fmtDate(ord.created_at);
      const payMethod  = ord.payment_method || 'cash';

      for (const item of ord.order_items || []) {
        rows.push([
          'FV',                          // Tipo Documento: Factura Venta
          'FV',                          // Prefijo
          ord.order_number || ord.id,
          dateStr,
          nit,
          clientName,
          item.product_name || 'Producto',
          item.quantity,
          formatCOPRaw(item.unit_price),
          '0',                           // Descuento a nivel de ítem
          formatCOPRaw(item.subtotal),
          item.vat_rate || 0,
          formatCOPRaw((item.subtotal || 0) * (item.vat_rate || 0) / 100),
          formatCOPRaw(item.subtotal),
          payMethod,
        ].map(escapeCsv).join(','));
      }
    }

    const csv = [header, ...rows].join('\r\n');
    const filename = `siigo_export_${date_from}_${date_to}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM para Excel en Windows
  } catch (err) {
    logger.error('GET /integrations/export/siigo', { err });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/integrations/export/generic ─────────────────────────────────────
// CSV genérico compatible con Xero / QuickBooks / cualquier sistema
router.get('/export/generic', [
  requireRole('admin', 'owner'),
  query('date_from').isDate(),
  query('date_to').isDate(),
  validate,
], async (req, res) => {
  try {
    const { date_from, date_to, branch_id } = req.query;

    if (branch_id) await assertBranchOwnership(branch_id, req.organizationId);

    const dayStart = `${date_from}T05:00:00.000Z`;
    const nextDate = new Date(date_to);
    nextDate.setDate(nextDate.getDate() + 1);
    const dayEnd = `${nextDate.toISOString().split('T')[0]}T05:00:00.000Z`;

    let q = supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, created_at, total, subtotal, tax_total,
        discount_amount, tip_amount, payment_method,
        customers(name, email),
        order_items(product_name, quantity, unit_price, vat_rate, subtotal)
      `)
      .eq('organization_id', req.organizationId)
      .eq('status', 'completed')
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd)
      .order('created_at');

    if (branch_id) q = q.eq('branch_id', branch_id);

    const { data: orders, error } = await q;
    if (error) throw error;

    const header = [
      'Date', 'InvoiceNumber', 'CustomerName', 'CustomerEmail',
      'Description', 'Quantity', 'UnitPrice', 'TaxRate', 'TaxAmount',
      'Discount', 'Tip', 'LineTotal', 'OrderTotal', 'PaymentMethod',
    ].map(escapeCsv).join(',');

    const rows = [];
    for (const ord of orders) {
      const clientName  = ord.customers?.name  || 'Walk-in';
      const clientEmail = ord.customers?.email || '';
      const dateStr     = fmtDate(ord.created_at);
      const tip         = Number(ord.tip_amount) || 0;

      for (const item of ord.order_items || []) {
        const vatRate   = item.vat_rate || 0;
        const lineSub   = Number(item.subtotal) || 0;
        const vatAmt    = Math.round(lineSub * vatRate / 100);
        rows.push([
          dateStr,
          ord.order_number || ord.id,
          clientName,
          clientEmail,
          item.product_name || 'Product',
          item.quantity,
          formatCOPRaw(item.unit_price),
          vatRate,
          formatCOPRaw(vatAmt),
          '0',
          formatCOPRaw(tip),
          formatCOPRaw(lineSub),
          formatCOPRaw(ord.total),
          ord.payment_method || '',
        ].map(escapeCsv).join(','));
      }
    }

    const csv = [header, ...rows].join('\r\n');
    const filename = `export_${date_from}_${date_to}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv);
  } catch (err) {
    logger.error('GET /integrations/export/generic', { err });
    res.status(500).json({ error: err.message });
  }
});

export default router;
