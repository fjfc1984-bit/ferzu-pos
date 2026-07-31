// =============================================================================
// FERZU POS — Trial Service
// Cron job: recordatorio email día 10 de trial (9:00 AM Colombia, 14:00 UTC)
// =============================================================================
import cron         from 'node-cron';
import { Resend }   from 'resend';
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../config/logger.js';

const resend = new Resend(process.env.RESEND_API_KEY);

// =============================================================================
// Template de email — separado de la lógica del cron para facilitar tests
// =============================================================================

export function buildTrialReminderEmail({ orgName, ownerEmail, totalVentas, numTransacciones, diasRestantes }) {
  const formatCOP = (n) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

  const ventasFormateadas = formatCOP(totalVentas);
  const ctaUrl = 'https://ferzu-pos.vercel.app/pricing';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu trial de FERZU POS termina pronto</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0f1a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1a;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#064e3b,#065f46);border-radius:16px 16px 0 0;padding:36px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:900;color:#10b981;letter-spacing:-1px;">FERZU <span style="color:#ffffff;">POS</span></div>
              <div style="font-size:13px;color:#6ee7b7;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Sistema de Punto de Venta</div>
            </td>
          </tr>

          <!-- Countdown banner -->
          <tr>
            <td style="background:#0f1f13;padding:0 40px;">
              <div style="background:linear-gradient(135deg,rgba(16,185,129,.15),rgba(6,182,212,.1));border:1px solid rgba(16,185,129,.3);border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
                <div style="font-size:13px;color:#6ee7b7;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">⏰ Tu prueba gratis termina en</div>
                <div style="font-size:56px;font-weight:900;color:#10b981;line-height:1;">${diasRestantes}</div>
                <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:4px;">días</div>
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#0f1f13;padding:0 40px 32px;">
              <p style="color:#d1fae5;font-size:17px;line-height:1.6;margin:0 0 24px;">
                Hola equipo de <strong style="color:#10b981;">${orgName}</strong> 👋
              </p>
              <p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 28px;">
                Llevan <strong style="color:#ffffff;">10 días</strong> usando FERZU POS y en ${diasRestantes} días su prueba gratis termina. No queremos que pierdan el acceso a todo lo que han construido.
              </p>

              <!-- Stats -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td width="48%" style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:12px;padding:20px 16px;text-align:center;">
                    <div style="font-size:28px;font-weight:900;color:#10b981;">${ventasFormateadas}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">procesado en su trial</div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.2);border-radius:12px;padding:20px 16px;text-align:center;">
                    <div style="font-size:28px;font-weight:900;color:#06b6d4;">${numTransacciones}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">transacciones realizadas</div>
                  </td>
                </tr>
              </table>

              <!-- Features reminder -->
              <p style="color:#9ca3af;font-size:14px;margin:0 0 16px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Lo que perderían sin una suscripción:</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                ${[
                  ['📊','Dashboard con métricas en tiempo real'],
                  ['🏪','POS offline-first (funciona sin internet)'],
                  ['📦','Control de inventario y alertas de stock'],
                  ['🧾','Facturación DIAN integrada'],
                  ['🤖','Asistente IA para atención al cliente'],
                ].map(([icon, text]) => `
                <tr>
                  <td style="padding:7px 0;">
                    <span style="font-size:16px;">${icon}</span>
                    <span style="color:#d1fae5;font-size:14px;margin-left:10px;">${text}</span>
                  </td>
                </tr>`).join('')}
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#ffffff;font-size:17px;font-weight:700;text-decoration:none;padding:16px 48px;border-radius:50px;letter-spacing:.5px;">
                      Activar mi suscripción →
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="color:#4b5563;font-size:12px;margin:0;">Planes desde <strong style="color:#10b981;">$79.000 COP/mes</strong> · Cancele cuando quiera</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#060d14;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;border-top:1px solid rgba(255,255,255,.05);">
              <p style="color:#374151;font-size:12px;margin:0 0 8px;">
                Recibiste este email porque registraste <strong style="color:#6b7280;">${orgName}</strong> en FERZU POS.
              </p>
              <p style="color:#374151;font-size:11px;margin:0;">
                © 2025 FERZU POS · Colombia · <a href="${ctaUrl}" style="color:#10b981;text-decoration:none;">ferzu-pos.vercel.app</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    from:    process.env.RESEND_FROM_EMAIL || 'FERZU POS <onboarding@resend.dev>',
    to:      ownerEmail,
    subject: `⏰ Quedan ${diasRestantes} días de tu prueba gratis — ${orgName}`,
    html,
  };
}

// =============================================================================
// Registro del cron job
// Corre todos los días a las 9:00 AM hora Colombia (14:00 UTC)
// =============================================================================

export function registerTrialCron() {
  cron.schedule('0 14 * * *', async () => {
    logger.info('[CRON] Iniciando job: recordatorio trial día 10');

    try {
      const now       = new Date();
      const tenDaysAgo = new Date(now);
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const dayStart = new Date(tenDaysAgo);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(tenDaysAgo);
      dayEnd.setUTCHours(23, 59, 59, 999);

      const { data: orgs, error: orgError } = await supabaseAdmin
        .from('organizations')
        .select('id, name, owner_id, created_at')
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString());

      if (orgError) {
        logger.error('[CRON] Error consultando orgs', { error: orgError.message });
        return;
      }

      if (!orgs?.length) {
        logger.info('[CRON] Sin organizaciones en día 10 hoy');
        return;
      }

      logger.info(`[CRON] ${orgs.length} org(s) en día 10 de trial`);

      for (const org of orgs) {
        try {
          const { data: { user }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(org.owner_id);
          if (userErr || !user?.email) {
            logger.warn('[CRON] No se pudo obtener email del owner', { org: org.id });
            continue;
          }

          const { data: orders } = await supabaseAdmin
            .from('orders')
            .select('total_amount')
            .eq('organization_id', org.id)
            .eq('status', 'completed')
            .gte('created_at', org.created_at)
            .lte('created_at', now.toISOString());

          const numTransacciones = orders?.length ?? 0;
          const totalVentas = orders?.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) ?? 0;

          const trialStart = new Date(org.created_at);
          const trialEnd   = new Date(trialStart);
          trialEnd.setDate(trialEnd.getDate() + 14);
          const diasRestantes = Math.max(1, Math.round((trialEnd - now) / (1000 * 60 * 60 * 24)));

          const emailPayload = buildTrialReminderEmail({
            orgName: org.name,
            ownerEmail: user.email,
            totalVentas,
            numTransacciones,
            diasRestantes,
          });

          const { error: sendErr } = await resend.emails.send(emailPayload);

          if (sendErr) {
            logger.error('[CRON] Error enviando email', { org: org.id, error: sendErr.message });
          } else {
            logger.info('[CRON] Email trial enviado', { org: org.id, email: user.email, diasRestantes });
          }
        } catch (orgErr) {
          logger.error('[CRON] Error procesando org', { org: org.id, error: orgErr.message });
        }
      }

      logger.info('[CRON] Job completado');
    } catch (err) {
      logger.error('[CRON] Error inesperado en job trial', { error: err.message });
    }
  }, {
    scheduled: true,
    timezone: 'America/Bogota',
  });

  logger.info('[CRON] Job "trial día 10" registrado — corre 9:00 AM hora Colombia');
}
