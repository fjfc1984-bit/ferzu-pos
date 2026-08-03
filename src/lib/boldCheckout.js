// =============================================================================
// FERZU POS — Bold Checkout Helper
// Estrategia: Links estáticos de Bold por plan (sin API key dinámica)
// Los links nunca vencen y reciben múltiples pagos.
//
// REGLA DE ORO: el webhook de Bold confirma el pago al backend.
// Este módulo solo redirige al link correcto según el plan.
// =============================================================================

// Mapa de links Bold estáticos por plan
// Creados en panel.bold.co — nunca vencen, reciben múltiples pagos
const BOLD_LINKS = {
  pos_basic:   'https://checkout.bold.co/payment/link/LNK_8DHFYQU0I9',
  barbershop:  'https://checkout.bold.co/payment/link/LNK_AEH7OB6F3L',
  workshop:    'https://checkout.bold.co/payment/link/LNK_AEH7OB6F3L',
  minimarket:  'https://checkout.bold.co/payment/link/LNK_AEH7OB6F3L',
  restaurant:  'https://checkout.bold.co/payment/link/LNK_YAOFU16XBE',
  pro:         'https://checkout.bold.co/payment/link/LNK_I6ARFZ8T6Q',
};

/**
 * Redirige al link de pago Bold correspondiente al plan.
 * Incluye organization_id y plan_id como metadata en la URL para que Bold
 * los propague en el webhook al backend.
 *
 * @param {object} params
 * @param {string} params.planId          - ID del plan ('pos_basic'|'barbershop'|...)
 * @param {string} params.organizationId  - UUID de la organización (REQUERIDO para activar plan)
 */
export function startPlanPayment({ planId, organizationId }) {
  const baseLink = BOLD_LINKS[planId];

  if (!baseLink) {
    throw new Error(`Plan no reconocido: ${planId}. Contacta soporte.`);
  }

  if (!organizationId) {
    throw new Error('organizationId requerido para procesar el pago.');
  }

  // Bold Links propagan query params como metadata en el webhook.
  // Esto permite que el webhook sepa a qué org activar sin almacenar estado.
  const url = new URL(baseLink);
  url.searchParams.set('metadata[organization_id]', organizationId);
  url.searchParams.set('metadata[plan_id]', planId);
  // redirect_url para que Bold nos devuelva al cliente con el order-id
  const origin = window.location.origin;
  url.searchParams.set('redirect_url', `${origin}/checkout/resultado?plan=${planId}`);

  window.location.href = url.toString();
}

/**
 * Verifica el estado de un pago tras el redirect de Bold.
 * Bold agrega ?order-id=... y ?status=... en la URL de redirect.
 */
export function parseBoldRedirectResult() {
  const params = new URLSearchParams(window.location.search);
  return {
    orderId: params.get('order-id'),
    status:  params.get('status'),    // 'APPROVED' | 'DECLINED' | 'PENDING'
    payment: params.get('payment'),   // 'success' si usamos nuestro redirect URL
  };
}
