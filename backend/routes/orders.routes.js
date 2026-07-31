// =============================================================================
// FERZU POS — Orders Routes  (/api/orders)
// REGLA DE ORO: El backend calcula todos los totales. Nunca el frontend.
// =============================================================================
import express  from 'express';
import { body } from 'express-validator';
import { supabaseAdmin }                          from '../config/supabase.js';
import logger                                     from '../config/logger.js';
import { requireAuth, requireRole, requireBranchAccess } from '../middleware/auth.js';
import { validate }                               from '../middleware/validate.js';
import { logAudit }                               from '../middleware/audit.js';
import { processPaymentInternal, markOrderPaid }  from '../services/orders.service.js';

const router = express.Router();
router.use(requireAuth);

// POST /orders — Crear nueva orden
router.post('/', [
  body('branch_id').isUUID(),
  body('cash_session_id').optional().isUUID(),
  body('order_type').isIn(['sale','delivery','table','appointment','work_order','quote']),
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').isUUID(),
  body('items.*.quantity').isFloat({ min: 0.001 }),
  validate,
  requireBranchAccess(),  // ✅ valida branch_id pertenece a la org
], async (req, res) => {
  try {
    const {
      branch_id, cash_session_id, order_type = 'sale',
      customer_id, table_id, appointment_id,
      items, discount_type, discount_value, notes,
      payment_method, cash_received, metadata = {},
    } = req.body;

    // 1. Cargar productos desde BD (precios oficiales, nunca del cliente)
    const productIds = [...new Set(items.map(i => i.product_id))];
    const { data: products, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id, name, sku, price, cost, vat_rate, vat_included, track_inventory')
      .in('id', productIds);

    if (prodErr || products.length !== productIds.length) {
      return res.status(400).json({ error: 'Uno o más productos no encontrados' });
    }
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // 2. Calcular totales (BACKEND — sin flotantes)
    let subtotal    = 0;
    let tax_total   = 0;
    const orderItems = [];

    for (const item of items) {
      const prod = productMap[item.product_id];
      const qty  = item.quantity;

      const unit_price_with_vat = prod.price;
      const unit_price_base = prod.vat_included
        ? Math.round(prod.price / (1 + prod.vat_rate / 100))
        : prod.price;
      const unit_vat_amount = unit_price_with_vat - unit_price_base;

      const item_subtotal = Math.round(unit_price_base * qty);
      const item_vat      = Math.round(unit_vat_amount * qty);

      subtotal  += item_subtotal;
      tax_total += item_vat;

      orderItems.push({
        product_id:      prod.id,
        product_name:    prod.name,
        product_sku:     prod.sku,
        quantity:        qty,
        unit_price:      unit_price_with_vat,
        unit_cost:       prod.cost || 0,
        vat_rate:        prod.vat_rate,
        vat_amount:      item_vat,
        discount_amount: 0,
        subtotal:        item_subtotal,
        modifiers:       item.modifiers || [],
        notes:           item.notes,
        staff_user_id:   item.staff_user_id || req.user.id,
      });
    }

    // 3. Aplicar descuento (validado en backend)
    let discount_amount = 0;
    if (discount_type && discount_value) {
      if (discount_type === 'percentage') {
        if (discount_value < 0 || discount_value > 100) {
          return res.status(400).json({ error: 'Porcentaje de descuento inválido (0-100)' });
        }
        discount_amount = Math.round((subtotal + tax_total) * discount_value / 100);
      } else if (discount_type === 'fixed') {
        discount_amount = Math.round(Math.min(discount_value, subtotal + tax_total));
      }
    }

    const total = subtotal + tax_total - discount_amount;
    if (total < 0) return res.status(400).json({ error: 'El total no puede ser negativo' });

    // 4. Generar número de orden
    const { data: orderNumData } = await supabaseAdmin
      .rpc('generate_order_number', { p_branch_id: branch_id });
    const order_number = orderNumData || `ORD-${Date.now()}`;

    // 5. Insertar orden
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert({
        branch_id, cash_session_id, order_type, order_number,
        customer_id, table_id, appointment_id,
        subtotal, tax_total, discount_amount, total,
        discount_type, discount_value, notes, metadata,
        status:        'open',
        created_by:    req.user.id,
        staff_user_id: req.user.id,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // 6. Insertar ítems
    const itemsWithOrderId = orderItems.map(i => ({ ...i, order_id: order.id }));
    const { error: itemsErr } = await supabaseAdmin.from('order_items').insert(itemsWithOrderId);
    if (itemsErr) throw itemsErr;

    // 7. Pago inmediato opcional
    if (payment_method) {
      await processPaymentInternal(order.id, payment_method, total, cash_received, req.user.id);
      await markOrderPaid(order.id, req.organizationId, req.user.id);
    }

    res.status(201).json({ ...order, items: itemsWithOrderId });
  } catch (err) {
    logger.error('POST /orders', { err });
    res.status(500).json({ error: err.message });
  }
});

// POST /orders/:id/payment — Registrar pago de orden existente
router.post('/:id/payment', [
  body('payment_method').isIn(['cash','card_debit','card_credit','nequi','daviplata','transfer','loyalty_points','other']),
  body('amount').isInt({ min: 1 }),
  validate,
], async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, amount, cash_received, transaction_ref, gateway } = req.body;

    const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', id).single();
    if (!order)                    return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.status === 'paid')   return res.status(409).json({ error: 'Orden ya pagada' });

    let cash_change = 0;
    if (payment_method === 'cash' && cash_received) {
      if (cash_received < amount) {
        return res.status(400).json({
          error: `Efectivo insuficiente. Recibido: $${cash_received.toLocaleString('es-CO')}`,
        });
      }
      cash_change = cash_received - amount;
    }

    await processPaymentInternal(id, payment_method, amount, cash_received, req.user.id, transaction_ref, gateway, cash_change);

    const { data: payments } = await supabaseAdmin
      .from('payments').select('amount').eq('order_id', id);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

    let orderStatus = order.status;
    if (totalPaid >= order.total) {
      await markOrderPaid(id, req.organizationId, req.user.id);
      orderStatus = 'paid';
    }

    res.json({ success: true, cash_change, total_paid: totalPaid, status: orderStatus });
  } catch (err) {
    logger.error('POST /orders/:id/payment', { err });
    res.status(500).json({ error: err.message });
  }
});

// POST /orders/:id/refund — Devolución (solo owner/admin)
router.post('/:id/refund', requireRole('owner', 'admin'), [
  body('amount').isInt({ min: 1 }),
  body('reason').notEmpty(),
  body('refund_method').notEmpty(),
  validate,
], async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason, refund_method } = req.body;

    const { data: order } = await supabaseAdmin.from('orders').select('total').eq('id', id).single();
    if (!order)               return res.status(404).json({ error: 'Orden no encontrada' });
    if (amount > order.total) return res.status(400).json({ error: 'Monto de devolución supera el total' });

    const { data: refund, error } = await supabaseAdmin.from('refunds').insert({
      order_id:    id,
      amount,
      reason,
      refund_method,
      approved_by: req.user.id,
    }).select().single();

    if (error) throw error;

    await supabaseAdmin.from('orders').update({ status: 'refunded' }).eq('id', id);
    await logAudit(req.organizationId, req.user.id, 'refund', 'orders', id, null, { amount, reason });
    res.json(refund);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
