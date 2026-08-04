// =============================================================================
// FERZU POS — Orders Service
//
// Funciones compartidas por ordersRouter y syncRouter.
// REGLA DE ORO: TODO cálculo matemático vive aquí — sin flotantes.
// =============================================================================
import { supabaseAdmin }           from '../config/supabase.js';
import logger                      from '../config/logger.js';
import { sendReceiptWhatsApp,
         isWhatsAppConfigured }     from './whatsapp.service.js';

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

  // ── Fidelización: acumular puntos del cliente (fire-and-forget) ─────────────
  (async () => {
    try {
      // Obtener total de la orden y customer_id
      const { data: ord } = await supabaseAdmin
        .from('orders')
        .select('total, customer_id')
        .eq('id', orderId)
        .single();

      if (!ord?.customer_id || !ord?.total) return;

      // Obtener config de la org (defaults si no existe)
      const { data: cfg } = await supabaseAdmin
        .from('loyalty_settings')
        .select('enabled, points_per_100cop')
        .eq('organization_id', organizationId)
        .single();

      const enabled         = cfg?.enabled          ?? true;
      const pointsPer100cop = cfg?.points_per_100cop ?? 1;

      if (!enabled || pointsPer100cop <= 0) return;

      // Calcular puntos: floor(total / 100) * pointsPer100cop
      const points = Math.floor(ord.total / 100) * pointsPer100cop;
      if (points <= 0) return;

      await supabaseAdmin.rpc('earn_loyalty_points', {
        p_organization_id: organizationId,
        p_customer_id:     ord.customer_id,
        p_order_id:        orderId,
        p_points:          points,
        p_notes:           `Compra ${orderId.slice(0, 8)}`,
      });

      logger.info(`[loyalty] ✅ ${points} puntos acumulados — cliente ${ord.customer_id}`);
    } catch (loyaltyErr) {
      logger.error('[loyalty] ⚠️ Error acumulando puntos (no crítico):', { err: loyaltyErr.message, orderId });
    }
  })();

  // ── Facturación electrónica DIAN (fire-and-forget, no bloquea el pago) ──────
  (async () => {
    try {
      const { triggerElectronicInvoice } = await import('../lib/dian.js');
      const result = await triggerElectronicInvoice(orderId, organizationId);
      if (result?.invoiceNumber) {
        logger.info(`[DIAN] ✅ Factura ${result.invoiceNumber} emitida para orden ${orderId}`);
      }
    } catch (dianErr) {
      // Error no crítico — la venta ya fue registrada, DIAN se reintentará por contingencia
      logger.error('[DIAN] ⚠️ Error generando factura electrónica (no crítico):', { err: dianErr.message, orderId });
    }
  })();

  // ── WhatsApp: enviar recibo al cliente si está configurado ──────────────────
  if (isWhatsAppConfigured()) {
    try {
      // Obtener datos del pedido y del cliente
      const { data: fullOrder } = await supabaseAdmin
        .from('orders')
        .select(`
          order_number, total,
          customers(name, phone),
          organizations(name)
        `)
        .eq('id', orderId)
        .single();

      const customerPhone = fullOrder?.customers?.phone;
      if (customerPhone) {
        // Fire-and-forget — no bloquear el flujo de pago
        sendReceiptWhatsApp({
          phone:        customerPhone,
          customerName: fullOrder.customers?.name  || 'Cliente',
          businessName: fullOrder.organizations?.name || 'FERZU POS',
          total:        fullOrder.total,
          orderNumber:  fullOrder.order_number,
        }).then(result => {
          if (!result.success) {
            logger.warn('[markOrderPaid] WhatsApp recibo fallido:', result.error);
          }
        });
      }
    } catch (waErr) {
      // No fallar la transacción por un error de WhatsApp
      logger.warn('[markOrderPaid] Error iniciando WhatsApp:', waErr.message);
    }
  }
}
