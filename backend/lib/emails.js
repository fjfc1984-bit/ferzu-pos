/**
 * FERZU POS — Templates de Email con Resend
 * Todos los emails transaccionales del sistema
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.RESEND_FROM_EMAIL || 'FERZU POS <noreply@ferzu.app>';

// ── Colores del brand ────────────────────────────────────────────────────────
const BRAND = {
  primary:   '#059669', // emerald-600
  dark:      '#065f46', // emerald-900
  light:     '#d1fae5', // emerald-100
  text:      '#1f2937',
  muted:     '#6b7280',
};

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f9fafb;
  margin: 0;
  padding: 0;
`;

function layout(content) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FERZU POS</title>
</head>
<body style="${baseStyle}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
        <!-- Header -->
        <tr>
          <td style="background:${BRAND.primary};padding:28px 40px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
              FERZU POS
            </h1>
            <p style="color:${BRAND.light};margin:4px 0 0;font-size:13px;">Sistema de Punto de Venta</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;color:${BRAND.text};">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f3f4f6;padding:20px 40px;text-align:center;">
            <p style="color:${BRAND.muted};font-size:12px;margin:0;">
              © ${new Date().getFullYear()} FERZU POS · Colombia<br>
              <a href="https://ferzu-pos.vercel.app" style="color:${BRAND.primary};text-decoration:none;">ferzu-pos.vercel.app</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── 1. Bienvenida tras registro ──────────────────────────────────────────────
export async function sendWelcomeEmail({ to, name }) {
  const html = layout(`
    <h2 style="color:${BRAND.primary};margin-top:0;">¡Bienvenido a FERZU POS, ${name}! 🎉</h2>
    <p style="line-height:1.7;margin-top:0;">
      Tu cuenta está lista. En los próximos minutos podrás configurar tu negocio
      y empezar a cobrar con la solución POS más completa de Colombia.
    </p>
    <h3 style="color:${BRAND.dark};font-size:16px;">¿Qué puedes hacer ahora?</h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${[
        ['🏪', 'Configura tu negocio', 'Completa el wizard de onboarding (5 minutos)'],
        ['📦', 'Agrega productos', 'Importa tu catálogo o créalo desde cero'],
        ['💳', 'Cobra tu primera venta', 'El POS funciona en cualquier dispositivo'],
        ['📊', 'Analiza tus ventas', 'Dashboard con métricas en tiempo real'],
      ].map(([icon, title, desc]) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;width:40px;font-size:24px;">${icon}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #f3f4f6;vertical-align:top;">
            <strong style="display:block;color:${BRAND.text};">${title}</strong>
            <span style="color:${BRAND.muted};font-size:14px;">${desc}</span>
          </td>
        </tr>`).join('')}
    </table>
    <div style="text-align:center;margin-top:32px;">
      <a href="https://ferzu-pos.vercel.app/onboarding"
         style="background:${BRAND.primary};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;display:inline-block;">
        Configurar mi negocio →
      </a>
    </div>
    <p style="color:${BRAND.muted};font-size:13px;margin-top:24px;text-align:center;">
      ¿Necesitas ayuda? Escríbenos a soporte@ferzu.app
    </p>
  `);

  return resend.emails.send({ from: FROM, to, subject: '¡Bienvenido a FERZU POS! 🎉', html });
}

// ── 2. Confirmación de suscripción ───────────────────────────────────────────
const PLAN_NAMES = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
const PLAN_PRICES = { starter: '79.000', pro: '149.000', enterprise: '299.000' };

export async function sendSubscriptionEmail({ to, name, planId, periodEnd }) {
  const planName  = PLAN_NAMES[planId] || planId;
  const planPrice = PLAN_PRICES[planId] || '—';
  const expiry    = new Date(periodEnd).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = layout(`
    <div style="text-align:center;margin-bottom:32px;">
      <div style="background:${BRAND.light};width:72px;height:72px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:36px;line-height:72px;">✅</div>
    </div>
    <h2 style="color:${BRAND.primary};margin-top:0;text-align:center;">Plan ${planName} activado</h2>
    <p style="text-align:center;color:${BRAND.muted};">Hola ${name}, tu suscripción está activa.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.light};border-radius:8px;padding:24px;margin:24px 0;">
      <tr>
        <td style="padding:8px 0;"><strong>Plan:</strong></td>
        <td style="text-align:right;font-weight:600;color:${BRAND.primary};">${planName}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;"><strong>Valor:</strong></td>
        <td style="text-align:right;">$${planPrice} COP / mes</td>
      </tr>
      <tr>
        <td style="padding:8px 0;"><strong>Próximo cobro:</strong></td>
        <td style="text-align:right;">${expiry}</td>
      </tr>
    </table>
    <div style="text-align:center;">
      <a href="https://ferzu-pos.vercel.app/dashboard"
         style="background:${BRAND.primary};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;display:inline-block;">
        Ir al Dashboard →
      </a>
    </div>
  `);

  return resend.emails.send({ from: FROM, to, subject: `✅ Plan ${planName} activado — FERZU POS`, html });
}

// ── 3. Recibo de venta al cliente ────────────────────────────────────────────
export async function sendReceiptEmail({ to, customerName, order }) {
  const { order_number, items = [], total, payment_method, created_at, branch_name } = order;
  const fecha = new Date(created_at).toLocaleString('es-CO');
  const metodoPago = { cash: 'Efectivo', card: 'Tarjeta', bold: 'Bold', transfer: 'Transferencia' }[payment_method] || payment_method;

  const itemRows = items.map(item => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 0;color:${BRAND.text};">${item.product_name}</td>
      <td style="padding:10px 0;text-align:center;color:${BRAND.muted};">${item.quantity}</td>
      <td style="padding:10px 0;text-align:right;color:${BRAND.text};">$${Number(item.unit_price).toLocaleString('es-CO')}</td>
      <td style="padding:10px 0;text-align:right;font-weight:600;color:${BRAND.text};">$${(item.quantity * item.unit_price).toLocaleString('es-CO')}</td>
    </tr>`).join('');

  const html = layout(`
    <h2 style="color:${BRAND.primary};margin-top:0;">Recibo de compra</h2>
    <p>Hola ${customerName || 'Cliente'}, gracias por tu compra en <strong>${branch_name || 'FERZU POS'}</strong>.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;color:${BRAND.muted};">
      <tr><td>Orden #:</td><td style="text-align:right;color:${BRAND.text};font-weight:600;">${order_number}</td></tr>
      <tr><td>Fecha:</td><td style="text-align:right;">${fecha}</td></tr>
      <tr><td>Pago:</td><td style="text-align:right;">${metodoPago}</td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 0;text-align:left;color:${BRAND.muted};font-weight:500;">Producto</th>
          <th style="padding:10px 0;text-align:center;color:${BRAND.muted};font-weight:500;">Cant.</th>
          <th style="padding:10px 0;text-align:right;color:${BRAND.muted};font-weight:500;">Precio</th>
          <th style="padding:10px 0;text-align:right;color:${BRAND.muted};font-weight:500;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding:16px 0 0;text-align:right;font-weight:600;font-size:16px;">Total:</td>
          <td style="padding:16px 0 0;text-align:right;font-weight:700;font-size:18px;color:${BRAND.primary};">
            $${Number(total).toLocaleString('es-CO')}
          </td>
        </tr>
      </tfoot>
    </table>
    <p style="color:${BRAND.muted};font-size:13px;margin-top:24px;text-align:center;">
      ¡Vuelve pronto! 💚
    </p>
  `);

  return resend.emails.send({ from: FROM, to, subject: `Recibo #${order_number} — FERZU POS`, html });
}

// ── 4. Alerta de stock bajo (para el dueño) ───────────────────────────────────
export async function sendLowStockAlert({ to, businessName, products }) {
  const rows = products.map(p => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 0;">${p.name}</td>
      <td style="padding:10px 0;text-align:center;color:#ef4444;font-weight:600;">${p.quantity}</td>
      <td style="padding:10px 0;text-align:center;color:${BRAND.muted};">${p.min_stock}</td>
    </tr>`).join('');

  const html = layout(`
    <h2 style="color:#ef4444;margin-top:0;">⚠️ Alerta de stock bajo</h2>
    <p>Hola, en <strong>${businessName}</strong> los siguientes productos están por debajo del mínimo:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      <thead>
        <tr style="background:#fef2f2;">
          <th style="padding:10px 0;text-align:left;color:${BRAND.muted};font-weight:500;">Producto</th>
          <th style="padding:10px 0;text-align:center;color:${BRAND.muted};font-weight:500;">Stock actual</th>
          <th style="padding:10px 0;text-align:center;color:${BRAND.muted};font-weight:500;">Mínimo</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://ferzu-pos.vercel.app/inventory"
         style="background:#ef4444;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;display:inline-block;">
        Ver inventario →
      </a>
    </div>
  `);

  return resend.emails.send({ from: FROM, to, subject: `⚠️ Stock bajo en ${businessName}`, html });
}

export default { sendWelcomeEmail, sendSubscriptionEmail, sendReceiptEmail, sendLowStockAlert };
