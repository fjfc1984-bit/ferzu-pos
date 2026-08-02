// =============================================================================
// FERZU POS — WhatsApp Business API (Meta Cloud API)
// Envío automático de recibos post-venta vía WhatsApp
// =============================================================================
// Configuración requerida en Railway (env vars):
//   WHATSAPP_TOKEN          → Access Token de Meta (nunca caduca si es token de sistema)
//   WHATSAPP_PHONE_NUMBER_ID → ID del número de WhatsApp Business (panel Meta)
//   WHATSAPP_TEMPLATE_NAME  → Nombre del template aprobado (default: ferzu_recibo)
//   WHATSAPP_TEMPLATE_LANG  → Código de idioma del template (default: es_CO)
// =============================================================================
// FLUJO:
//   Orden pagada → markOrderPaid() → sendReceiptWhatsApp() → Meta API → cliente
// =============================================================================

import fetch from 'node-fetch';

const META_API_VERSION = 'v19.0';
const META_BASE_URL    = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Verifica si WhatsApp está configurado en las variables de entorno.
 */
export function isWhatsAppConfigured() {
  return !!(
    process.env.WHATSAPP_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

/**
 * Envía un recibo de venta por WhatsApp al cliente.
 *
 * Template esperado (ferzu_recibo):
 *   Body: "Hola {{1}}, tu compra en {{2}} por ${{3}} fue procesada. N° {{4}}. ¡Gracias!"
 *   Params: [customer_name, business_name, total_formatted, order_number]
 *
 * @param {Object} params
 * @param {string} params.phone          - Número del cliente (formato: 573001234567)
 * @param {string} params.customerName   - Nombre del cliente
 * @param {string} params.businessName   - Nombre del negocio
 * @param {number} params.total          - Total en COP (número entero)
 * @param {string} params.orderNumber    - Número de orden (Ej: ORD-0042)
 * @param {Array}  params.items          - [{ name, quantity, price }] (para mensaje enriquecido)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendReceiptWhatsApp({ phone, customerName, businessName, total, orderNumber, items = [] }) {
  if (!isWhatsAppConfigured()) {
    console.log('[WhatsApp] No configurado — omitiendo envío de recibo');
    return { success: false, error: 'WhatsApp no configurado' };
  }

  // Limpiar y validar número
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: 'Número de WhatsApp inválido' };
  }
  // Si empieza con 3 (Colombia), agregar código de país 57
  const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;

  const token          = process.env.WHATSAPP_TOKEN;
  const phoneNumberId  = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName   = process.env.WHATSAPP_TEMPLATE_NAME  || 'ferzu_recibo';
  const templateLang   = process.env.WHATSAPP_TEMPLATE_LANG  || 'es';

  const totalFormatted = new Intl.NumberFormat('es-CO', {
    style:    'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(total);

  const body = {
    messaging_product: 'whatsapp',
    to:                fullPhone,
    type:              'template',
    template: {
      name:     templateName,
      language: { code: templateLang },
      components: [
        {
          type:       'body',
          parameters: [
            { type: 'text', text: customerName  || 'Cliente'     },
            { type: 'text', text: businessName  || 'FERZU POS'   },
            { type: 'text', text: totalFormatted                  },
            { type: 'text', text: orderNumber   || 'N/A'         },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(
      `${META_BASE_URL}/${phoneNumberId}/messages`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error('[WhatsApp] Error Meta API:', data);
      return {
        success:   false,
        error:     data?.error?.message || `HTTP ${res.status}`,
        errorCode: data?.error?.code,
      };
    }

    const messageId = data?.messages?.[0]?.id;
    console.log(`[WhatsApp] Recibo enviado a ${fullPhone} → messageId: ${messageId}`);
    return { success: true, messageId };

  } catch (err) {
    console.error('[WhatsApp] Error de red:', err.message);
    return { success: false, error: err.message };
  }
}


/**
 * Envía un mensaje de prueba para verificar la configuración.
 * Usa el template pero con datos ficticios.
 */
export async function sendTestWhatsApp(phone, businessName) {
  return sendReceiptWhatsApp({
    phone,
    customerName: 'Cliente de Prueba',
    businessName: businessName || 'FERZU POS',
    total:        49900,
    orderNumber:  'TEST-001',
    items:        [{ name: 'Producto de prueba', quantity: 1, price: 49900 }],
  });
}


/**
 * Obtiene el estado de un mensaje enviado (delivered, read, etc.)
 * @param {string} messageId
 */
export async function getMessageStatus(messageId) {
  if (!isWhatsAppConfigured()) return null;

  const token = process.env.WHATSAPP_TOKEN;
  try {
    const res = await fetch(
      `${META_BASE_URL}/${messageId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return await res.json();
  } catch {
    return null;
  }
}
