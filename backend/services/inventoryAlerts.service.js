// =============================================================================
// FERZU POS — Inventory Alerts Service
// CRON cada hora: detecta productos bajo stock mínimo o agotados y despacha
// alertas a los canales configurados por cada organización (email / WhatsApp).
//
// Flujo:
//   1. Consultar productos con track_inventory=true y min_stock > 0
//   2. Comparar quantity actual vs min_stock por sucursal
//   3. Insertar en system_alerts (si no existe una activa reciente)
//   4. dispatchAlert → email/WhatsApp via alertDispatcher.service.js
//
// Anti-spam:
//   - No crear nueva alerta si ya hay una activa (is_resolved=false) del mismo
//     producto+sucursal en las últimas COOLDOWN_HOURS horas.
//   - El dispatcher tiene su propio cooldown adicional por tipo de alerta.
// =============================================================================

import cron from 'node-cron';
import { supabaseAdmin }  from '../config/supabase.js';
import logger             from '../config/logger.js';
import { dispatchAlert }  from './alertDispatcher.service.js';

const COOLDOWN_HOURS = 4; // No re-alertar el mismo producto en 4 horas

// =============================================================================
// CHECK PRINCIPAL
// =============================================================================

async function checkInventoryAlerts() {
  try {
    logger.debug('[inventory-alerts] Iniciando check de stock...');

    // ── 1. Traer todos los productos con tracking activo y min_stock definido ──
    const { data: rows, error } = await supabaseAdmin
      .from('inventory')
      .select(`
        id,
        quantity,
        branch_id,
        product_id,
        products!inner(
          id, name, sku, min_stock, track_inventory, organization_id
        ),
        branches!inner(
          id, name, organization_id
        )
      `)
      .eq('products.track_inventory', true)
      .gt('products.min_stock', 0);   // solo los que tienen stock mínimo definido

    if (error) {
      logger.error('[inventory-alerts] Error consultando inventario', { err: error.message });
      return;
    }

    if (!rows || rows.length === 0) {
      logger.debug('[inventory-alerts] Sin productos con min_stock configurado');
      return;
    }

    // ── 2. Filtrar los que están en alerta ─────────────────────────────────────
    const alertItems = rows.filter(r => {
      const qty      = r.quantity ?? 0;
      const minStock = r.products?.min_stock ?? 0;
      return qty <= minStock;
    });

    if (alertItems.length === 0) {
      logger.debug('[inventory-alerts] Todo el inventario dentro de límites OK');
      return;
    }

    logger.info(`[inventory-alerts] ${alertItems.length} producto(s) bajo stock mínimo`);

    // ── 3. Cooldown: traer alertas activas recientes ───────────────────────────
    const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recentAlerts } = await supabaseAdmin
      .from('system_alerts')
      .select('metadata')
      .in('alert_type', ['low_stock', 'out_of_stock'])
      .eq('is_resolved', false)
      .gte('created_at', cooldownSince);

    // Construir set de claves ya alertadas: "product_id:branch_id"
    const alreadyAlerted = new Set(
      (recentAlerts || [])
        .filter(a => a.metadata?.product_id && a.metadata?.branch_id)
        .map(a => `${a.metadata.product_id}:${a.metadata.branch_id}`)
    );

    // ── 4. Procesar cada item de alerta ────────────────────────────────────────
    for (const item of alertItems) {
      const product = item.products;
      const branch  = item.branches;
      const orgId   = product?.organization_id;

      if (!orgId || !product || !branch) continue;

      const key = `${product.id}:${item.branch_id}`;
      if (alreadyAlerted.has(key)) {
        logger.debug(`[inventory-alerts] Cooldown activo para ${product.name} en ${branch.name}`);
        continue;
      }

      const qty      = item.quantity ?? 0;
      const minStock = product.min_stock;
      const isOut    = qty <= 0;
      const alertType  = isOut ? 'out_of_stock' : 'low_stock';
      const severity   = isOut ? 'critical'     : qty <= Math.ceil(minStock * 0.5) ? 'high' : 'medium';
      const description = isOut
        ? `El producto "${product.name}" está AGOTADO en la sucursal "${branch.name}".`
        : `Stock bajo: "${product.name}" tiene ${qty} unidad(es) en "${branch.name}" (mínimo: ${minStock}).`;

      // ── 4a. Insertar en system_alerts ──────────────────────────────────────
      const { data: newAlert, error: insertErr } = await supabaseAdmin
        .from('system_alerts')
        .insert({
          organization_id: orgId,
          branch_id:       item.branch_id,
          alert_type:      alertType,
          severity,
          description,
          is_resolved:     false,
          metadata: {
            product_id:   product.id,
            product_name: product.name,
            sku:          product.sku || '',
            branch_id:    item.branch_id,
            branch_name:  branch.name,
            quantity:     qty,
            min_stock:    minStock,
          },
        })
        .select('id, alert_type, severity, description, metadata, branch_id')
        .single();

      if (insertErr) {
        logger.warn('[inventory-alerts] No se pudo insertar alerta', {
          product: product.name,
          err:     insertErr.message,
        });
        continue;
      }

      // Marcar como alertada para evitar duplicados en este mismo ciclo
      alreadyAlerted.add(key);

      logger.info('[inventory-alerts] Alerta creada', {
        alertType,
        severity,
        product: product.name,
        branch:  branch.name,
        qty,
        minStock,
      });

      // ── 4b. Despachar (fire-and-forget) ────────────────────────────────────
      Promise.resolve(
        dispatchAlert(newAlert, orgId, supabaseAdmin)
      ).catch(err =>
        logger.error('[inventory-alerts] Error despachando alerta', { err: err.message })
      );
    }

  } catch (err) {
    logger.error('[inventory-alerts] Error inesperado en checkInventoryAlerts', { err: err.message });
  }
}

// =============================================================================
// REGISTRO DEL CRON — llamar desde server.js
// =============================================================================

export function registerInventoryAlertsCron() {
  logger.info('[inventory-alerts] CRON de alertas de stock activo — cada hora');

  // Primera ejecución 2 minutos después del boot (evita arrancar en frío)
  setTimeout(checkInventoryAlerts, 2 * 60 * 1000);

  // Luego cada hora en punto (0 * * * *)
  cron.schedule('0 * * * *', checkInventoryAlerts);
}

// Exportar para testing
export { checkInventoryAlerts };
