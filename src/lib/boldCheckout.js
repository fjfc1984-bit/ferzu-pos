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
 * Después del pago, Bold llama al webhook del backend para activar el plan.
 *
 * @param {object} params
 * @param {string} params.planId - ID del plan ('pos_basic'|'barbershop'|'workshop'|'minimarket'|'restaurant'|'pro')
 */
export function startPlanPayment({ planId }) {
  const link = BOLD_LINKS[planId];

  if (!link) {
    throw new Error(`Plan no reconocido: ${planId}. Contacta soporte.`);
  }

  // Redirigir al link de pago Bold
  window.location.href = link;
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
