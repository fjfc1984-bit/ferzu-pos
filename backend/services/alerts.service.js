// =============================================================================
// FERZU POS — Alerts Service
// Monitoreo proactivo cada 5 min → notificaciones WhatsApp + Email.
//
// Variables de entorno requeridas (Railway):
//   ALERT_EMAIL              → tu email (ej: fernando@gmail.com)
//   ALERT_WHATSAPP_PHONE     → tu número internacional sin + (ej: 573001234567)
//   ALERT_WHATSAPP_APIKEY    → API key de Callmebot (ver instrucciones abajo)
//   RESEND_API_KEY           → ya configurado para emails transaccionales
//
// ── Cómo activar Callmebot (gratis, 1 vez) ──────────────────────────────────
//   1. Envía un WhatsApp a +34 644 59 77 71 con el texto: "I allow callmebot to send me messages"
//   2. Recibirás tu APIKEY por WhatsApp
//   3. Agrégala en Railway como ALERT_WHATSAPP_APIKEY
//
// ── Anti-spam ────────────────────────────────────────────────────────────────
//   - Solo alerta cuando el estado CAMBIA (ok→warning, ok→critical, etc.)
//   - Si persiste el problema: recordatorio cada 30 minutos
//   - Al recuperarse: alerta de "sistema normalizado"
// =============================================================================

import cron     from 'node-cron';
import { Resend } from 'resend';
import { supabaseAdmin } from '../config/supabase.js';
import logger             from '../config/logger.js';
import os from 'os';

// ── Config ───────────────────────────────────────────────────────────────────
const RESEND_API_KEY    = process.env.RESEND_API_KEY;
const FROM_EMAIL        = process.env.RESEND_FROM_EMAIL || 'FERZU POS <noreply@ferzu.app>';
const ALERT_EMAIL       = process.env.ALERT_EMAIL;
const WA_PHONE          = process.env.ALERT_WHATSAPP_PHONE;
const WA_APIKEY         = process.env.ALERT_WHATSAPP_APIKEY;
const REMINDER_MS       = 30 * 60 * 1000; // recordatorio si persiste >30 min

// ── Estado en memoria (no persiste entre restarts — intencional) ──────────────
let lastStatus    = 'ok';
let lastAlertAt   = null;
let checkCount    = 0;

// ── Umbrales (iguales que health.routes.js) ───────────────────────────────────
const T = {
  auth_warn_ms:  800,   auth_crit_ms:  3000,
  db_warn_ms:    600,   db_crit_ms:    2000,
  mem_warn_mb:   350,   mem_crit_mb:   600,
};

// =============================================================================
// CHECKS (reutiliza lógica de health.routes.js sin duplicar la ruta HTTP)
// =============================================================================

async function checkAuth() {
  const t0 = Date.now();
  try {
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const ms = Date.now() - t0;
    if (error) throw new Error(error.message);
    return {
      status: ms >= T.auth_crit_ms ? 'critical' : ms >= T.auth_warn_ms ? 'warning' : 'ok',
      detail: `Auth ${ms}ms`,
    };
  } catch (e) {
    return { status: 'critical', detail: `Auth ERROR: ${e.message}` };
  }
}

async function checkDB() {
  const t0 = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from('organizations').select('id', { count: 'exact', head: true });
    const ms = Date.now() - t0;
    if (error) throw new Error(error.message);
    return {
      status: ms >= T.db_crit_ms ? 'critical' : ms >= T.db_warn_ms ? 'warning' : 'ok',
      detail: `DB ${ms}ms`,
    };
  } catch (e) {
    return { status: 'critical', detail: `DB ERROR: ${e.message}` };
  }
}

function checkMemory() {
  const mb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  return {
    status: mb >= T.mem_crit_mb ? 'critical' : mb >= T.mem_warn_mb ? 'warning' : 'ok',
    detail: `RAM ${mb}MB | Uptime ${Math.round(process.uptime() / 60)}min`,
  };
}

async function runChecks() {
  const [auth, db, mem] = await Promise.all([checkAuth(), checkDB(), Promise.resolve(checkMemory())]);
  const components = { auth, db, mem };
  const statuses   = [auth.status, db.status, mem.status];
  const overall    = statuses.includes('critical') ? 'critical'
                   : statuses.includes('warning')  ? 'warning'
                   : 'ok';
  return { overall, components };
}

// =============================================================================
// CANALES DE NOTIFICACIÓN
// =============================================================================

async function sendWhatsApp(text) {
  if (!WA_PHONE || !WA_APIKEY) return;
  try {
    const encoded = encodeURIComponent(text);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${WA_PHONE}&text=${encoded}&apikey=${WA_APIKEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    logger.info('[alerts] WhatsApp enviado');
  } catch (e) {
    logger.warn('[alerts] WhatsApp error', { err: e.message });
  }
}

async function sendEmail(subject, html) {
  if (!ALERT_EMAIL || !RESEND_API_KEY) return;
  try {
    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({ from: FROM_EMAIL, to: ALERT_EMAIL, subject, html });
    logger.info('[alerts] Email enviado', { subject });
  } catch (e) {
    logger.warn('[alerts] Email error', { err: e.message });
  }
}

function buildMessage(status, components, isReminder = false) {
  const emoji = status === 'critical' ? '🚨' : status === 'warning' ? '⚠️' : '✅';
  const label = status === 'critical' ? 'CRÍTICO' : status === 'warning' ? 'ADVERTENCIA' : 'NORMALIZADO';
  const prefix = isReminder ? '[RECORDATORIO] ' : '';
  const lines  = Object.entries(components)
    .filter(([, v]) => v.status !== 'ok')
    .map(([k, v]) => `• ${k.toUpperCase()}: ${v.detail}`)
  const detail = lines.length > 0 ? '\n' + lines.join('\n') : '\nTodo operando con normalidad.';
  const ts = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  return {
    wa: `${prefix}${emoji} FERZU POS — ${label} (${ts})${detail}`,
    subject: `${prefix}${emoji} FERZU POS ${label} — ${ts}`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
        <h2 style="color:${status === 'critical' ? '#dc2626' : status === 'warning' ? '#d97706' : '#059669'}">
          ${emoji} FERZU POS — Sistema ${label}
        </h2>
        <p style="color:#6b7280;font-size:13px">${new Date().toLocaleString('es-CO')}</p>
        ${lines.length > 0
          ? `<ul>${lines.map(l => `<li style="margin:4px 0">${l.replace('• ', '')}</li>`).join('')}</ul>`
          : `<p style="color:#059669">✅ Todos los componentes operando con normalidad.</p>`
        }
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
        <p style="font-size:11px;color:#9ca3af">
          FERZU POS · Monitoreo automático cada 5 min<br>
          Endpoint: /api/health/full
        </p>
      </div>`,
  };
}

// =============================================================================
// LÓGICA PRINCIPAL: checkAndAlert
// =============================================================================

async function checkAndAlert() {
  checkCount++;
  try {
    const { overall, components } = await runChecks();
    const now = Date.now();
    const statusChanged  = overall !== lastStatus;
    const isReminder     = overall !== 'ok' && lastAlertAt && (now - lastAlertAt) >= REMINDER_MS;

    if (statusChanged || isReminder) {
      const isRemind = !statusChanged && isReminder;
      const { wa, subject, html } = buildMessage(overall, components, isRemind);

      await Promise.all([
        sendWhatsApp(wa),
        sendEmail(subject, html),
      ]);

      lastAlertAt = now;
      if (statusChanged) {
        logger.warn('[alerts] Estado cambiado', { from: lastStatus, to: overall });
        lastStatus = overall;
      } else {
        logger.info('[alerts] Recordatorio enviado', { status: overall });
      }
    } else if (overall === 'ok' && checkCount % 12 === 0) {
      // Log silencioso cada hora para confirmar que el cron sigue activo
      logger.debug('[alerts] Health OK (cron activo)');
    }
  } catch (e) {
    logger.error('[alerts] Error en checkAndAlert', { err: e.message });
  }
}

// =============================================================================
// REGISTRO DEL CRON — llamar desde server.js
// =============================================================================

export function registerAlertsCron() {
  // Verificar si las variables están configuradas
  const hasEmail = !!ALERT_EMAIL && !!RESEND_API_KEY;
  const hasWA    = !!WA_PHONE && !!WA_APIKEY;

  if (!hasEmail && !hasWA) {
    logger.warn('[alerts] Cron de alertas DESACTIVADO — ningún canal configurado. Agrega ALERT_EMAIL o ALERT_WHATSAPP_PHONE+ALERT_WHATSAPP_APIKEY en Railway.');
    return;
  }

  logger.info('[alerts] Cron activo — cada 5 min', {
    email:    hasEmail ? ALERT_EMAIL : 'no configurado',
    whatsapp: hasWA    ? `***${WA_PHONE.slice(-4)}` : 'no configurado',
  });

  // Ejecutar inmediatamente al iniciar (para verificar que funciona)
  setTimeout(checkAndAlert, 10_000); // 10s después del boot

  // Cada 5 minutos
  cron.schedule('*/5 * * * *', checkAndAlert);
}
