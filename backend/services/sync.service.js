// =============================================================================
// FERZU POS — Sync Service
//
// Procesa operaciones offline enviadas desde el cliente.
// REGLA DE ORO: recalcula precios desde la BD — nunca confía en el payload.
// =============================================================================
import { supabaseAdmin }                          from '../config/supabase.js';
import { processPaymentInternal, markOrderPaid }  from './orders.service.js';
import { assertBranchOwnership }                  from '../middleware/auth.js';

/**
 * createOrderFromSync
 * Crea una orden a partir de un payload offline.
 * Idéntica lógica que POST /orders, pero con source='offline'.
 */
export async function createOrderFromSync(payload, organizationId, userId) {
  const {
    items = [], branch_id, cash_session_id, customer_id,
    discount_type, discount_value, payment_method, cash_received,
    order_type = 'sale', notes, metadata = {},
  } = payload;

  if (!items.length) throw new Error('Orden offline vacía');

  // 0. Validar que el branch_id pertenece a la organización (FIX: cross-tenant via sync)
  if (!branch_id) throw new Error('branch_id requerido en payload offline');
  await assertBranchOwnership(branch_id, organizationId);

  // 1. Cargar precios oficiales desde BD — nunca del cliente
  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: products, error: prodErr } = await supabaseAdmin
    .from('products')
    .select('id, name, sku, price, cost, vat_rate, vat_included, track_inventory')
    .in('id', productIds);

  if (prodErr || !products || products.length !== productIds.length) {
    throw new Error('Uno o más productos de la orden offline no existen');
  }
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  // 2. Recalcular totales — cálculo determinista (REGLA DE ORO: sin flotantes)
  let subtotal  = 0;
  let tax_total = 0;
  const orderItems = [];

  for (const item of items) {
    const prod = productMap[item.product_id];
    const qty  = item.quantity;

    const unit_price_with_vat = prod.price;
    const unit_price_base = prod.vat_included
      ? Math.round(prod.price / (1 + prod.vat_rate / 100))
      : prod.price;
    const unit_vat_amount = unit_price_with_vat - unit_price_base;
    const item_subtotal   = Math.round(unit_price_base * qty);
    const item_vat        = Math.round(unit_vat_amount * qty);

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
      staff_user_id:   userId,
    });
  }

  // 3. Descuento validado en backend
  let discount_amount = 0;
  if (discount_type && discount_value) {
    if (discount_type === 'percentage' && discount_value >= 0 && discount_value <= 100) {
      discount_amount = Math.round((subtotal + tax_total) * discount_value / 100);
    } else if (discount_type === 'fixed') {
      discount_amount = Math.round(Math.min(discount_value, subtotal + tax_total));
    }
  }
  const total = Math.max(0, subtotal + tax_total - discount_amount);

  // 4. Número de orden
  const { data: orderNumData } = await supabaseAdmin
    .rpc('generate_order_number', { p_branch_id: branch_id });
  const order_number = orderNumData || `ORD-SYNC-${Date.now()}`;

  // 5. Insertar orden con totales recalculados
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      branch_id, cash_session_id, order_type, order_number,
      customer_id: customer_id || null,
      subtotal, tax_total, discount_amount, total,
      discount_type, discount_value, notes, metadata,
      status:        'open',
      created_by:    userId,
      staff_user_id: userId,
      synced_at:     new Date().toISOString(),
    })
    .select()
    .single();
  if (orderErr) throw orderErr;

  // 6. Insertar ítems
  const itemsWithId = orderItems.map(i => ({ ...i, order_id: order.id }));
  const { error: itemsErr } = await supabaseAdmin.from('order_items').insert(itemsWithId);
  if (itemsErr) throw itemsErr;

  // 7. Procesar pago si viene en el payload
  if (payment_method === 'mixed') {
    // Pago mixto offline: registrar cash + card por separado
    const cashAmt = payload.cash_amount || 0;
    const cardAmt = payload.card_amount || 0;
    if (cashAmt > 0) {
      await processPaymentInternal(order.id, 'cash', cashAmt, cashAmt, userId);
    }
    if (cardAmt > 0) {
      await processPaymentInternal(order.id, 'card_debit', cardAmt, null, userId);
    }
    await markOrderPaid(order.id, organizationId, userId);
  } else if (payment_method) {
    await processPaymentInternal(order.id, payment_method, total, cash_received, userId);
    await markOrderPaid(order.id, organizationId, userId);
  }

  return order;
}

/**
 * processSyncOperation
 * Despacha una operación offline al handler correcto según tabla + operación.
 */
export async function processSyncOperation(op, organizationId, userId) {
  switch (op.table_name) {
    case 'orders':
      if (op.operation === 'INSERT') {
        return await createOrderFromSync(op.payload, organizationId, userId);
      }
      break;
    case 'inventory_movements':
      if (op.operation === 'INSERT') {
        const { data } = await supabaseAdmin
          .from('inventory_movements')
          .insert({ ...op.payload, created_by: userId })
          .select()
          .single();
        return data;
      }
      break;
    default:
      throw new Error(`Tabla no soportada para sync: ${op.table_name}`);
  }
}
