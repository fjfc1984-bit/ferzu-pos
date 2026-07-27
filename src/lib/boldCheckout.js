// =============================================================================
// FERZU POS — Bold Checkout Helper
// Documentación: https://docs.getbold.io/
//
// Bold usa un checkout hospedado: redirigimos al usuario a la URL de Bold
// con los parámetros firmados. Bold procesa el pago y llama nuestro webhook.
//
// REGLA DE ORO: el cálculo del monto siempre viene del backend.
// Este módulo solo construye la URL de redirección.
// =============================================================================

const BOLD_API_KEY     = import.meta.env.VITE_BOLD_API_KEY     || '';
const BOLD_REDIRECT_URL = import.meta.env.VITE_BOLD_REDIRECT_URL || 'https://ferzu-pos.vercel.app/pricing?payment=success';
const API              = import.meta.env.VITE_API_URL           || 'http://localhost:3001/api';

/**
 * Inicia el checkout de Bold para una suscripción.
 *
 * @param {object} params
 * @param {string} params.organizationId - ID de la organización en Supabase
 * @param {string} params.planId         - Identificador del plan ('starter'|'pro'|'enterprise')
 * @param {number} params.amountCOP      - Monto en COP (calculado por el BACKEND, nunca por el cliente)
 * @param {string} params.description    - Descripción del cobro
 * @param {string} params.customerEmail  - Email del cliente
 * @param {string} params.orderId        - ID único del cobro (uuid generado por el backend)
 */
export async function initBoldCheckout({ organizationId, planId, amountCOP, description, customerEmail, orderId }) {
  if (!BOLD_API_KEY) {
    console.error('[Bold] VITE_BOLD_API_KEY no configurada');
    throw new Error('Pasarela de pagos no configurada. Contacta soporte.');
  }

  // Parámetros de la sesión de pago Bold
  // Referencia: https://docs.getbold.io/docs/checkout
  const params = new URLSearchParams({
    'order-id':        orderId,
    'amount':          String(Math.round(amountCOP)),  // Bold espera entero en centavos de COP
    'currency':        'COP',
    'api-key':         BOLD_API_KEY,
    'redirect-url':    BOLD_REDIRECT_URL,
    'customer-email':  customerEmail,
    'description':     description,
    // metadata que Bold nos devolverá en el webhook
    'metadata[organization_id]': organizationId,
    'metadata[plan_id]':         planId,
    'metadata[order_id]':        orderId,
  });

  // URL del checkout hospedado de Bold (producción)
  const boldCheckoutUrl = `https://checkout.bold.co/payment/link?${params.toString()}`;

  // Redirigir al usuario al checkout de Bold
  window.location.href = boldCheckoutUrl;
}

/**
 * Crea una sesión de pago en el backend y redirige al checkout de Bold.
 * El backend calcula el monto según el plan y devuelve el orderId firmado.
 *
 * @param {object} params
 * @param {string} params.planId        - Plan seleccionado por el usuario
 * @param {string} params.organizationId
 * @param {string} params.token         - JWT del usuario autenticado
 */
export async function startPlanPayment({ planId, organizationId, token }) {
  // 1. Solicitar al backend que genere la orden de cobro con monto calculado
  const res = await fetch(`${API}/payments/create-bold-session`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ planId, organizationId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error creando sesión de pago');
  }

  const { orderId, amountCOP, description, customerEmail } = await res.json();

  // 2. Redirigir al checkout de Bold con los datos del backend
  await initBoldCheckout({ organizationId, planId, amountCOP, description, customerEmail, orderId });
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
