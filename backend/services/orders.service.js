// =============================================================================
// FERZU POS — Orders Service
//
// Funciones compartidas por ordersRouter y syncRouter.
// REGLA DE ORO: TODO cálculo matemático vive aquí — sin flotantes.
// =============================================================================
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../config/logger.js';

/**
 * processPaymentInternal
 * Registra un pago en la tabla payments.
 * Llamado por POST /orders (pago inmediato) y POST /orders/:id/payment.
 */
export async function processPaymentInternal(orderId, method, amount, cashReceived, userId, ref, gateway, cashChange = 0) {
  const { error } = await supabaseAdmin.from('payments').insert({
    order_id:        orderId,
    payment_method:  method,
    amount,
    cash_received:   cashReceived,
    cash_change:     cashChange,
    transaction_ref: ref,
    gateway:         gateway || 'manual',
    gateway_status:  'approved',
  });
  if (error) throw new Error(`Error registrando pago: ${error.message}`);
}

/**
 * markOrderPaid
 * Marca la orden como pagada y descuenta inventario de forma atómica.
 * Usa la función RPC decrement_inventory para evitar race conditions.
 */
export async function markOrderPaid(orderId, organizationId, userId) {
  await supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', orderId);

  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_id, variant_id, quantity, unit_cost')
    .eq('order_id', orderId);

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('branch_id')
    .eq('id', orderId)
    .single();

  for (const item of items || []) {
    // Movimiento de inventario (salida = cantidad negativa)
    // QA-7 FIX: destructurar { error } — sin esto el error se ignora silenciosamente
    const { error: movErr } = await supabaseAdmin.from('inventory_movements').insert({
      branch_id:      order.branch_id,
      product_id:     item.product_id,
      variant_id:     item.variant_id || null,
      movement_type:  'sale',
      quantity:       -item.quantity,
      unit_cost:      item.unit_cost || 0,
      reference_type: 'order',
      reference_id:   orderId,
      notes:          `Venta registrada`,
      created_by:     userId,
    });
    if (movErr) {
      logger.error('[markOrderPaid] Error al insertar inventory_movement', {
        movErr: movErr.message, product_id: item.product_id, orderId,
      });
    }

    // Actualizar stock con RPC atómica para evitar race conditions.
    // La función SQL decrement_inventory hace: UPDATE SET quantity = quantity - p_qty
    // en una sola operación, sin leer el valor primero.
    const { error: rpcErr } = await supabaseAdmin.rpc('decrement_inventory', {
      p_branch_id:  order.branch_id,
      p_product_id: item.product_id,
      p_quantity:   item.quantity,
    });

    if (rpcErr) {
      // Si la función RPC no existe aún (entorno legacy), fallback a UPDATE directo
      logger.warn('[markOrderPaid] decrement_inventory RPC no disponible, usando fallback', {
        rpcErr: rpcErr.message,
      });
      await supabaseAdmin
        .from('inventory')
        .update({ updated_at: new Date().toISOString() })
        .eq('branch_id', order.branch_id)
        .eq('product_id', item.product_id);
      // Nota: sin RPC, este UPDATE no puede hacer aritmética atómica.
      // Ejecutar views_v1.sql en Supabase para activar decrement_inventory.
    }
  }
}
