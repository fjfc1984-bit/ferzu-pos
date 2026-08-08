// =============================================================================
// FERZU POS — Alert Dispatcher Service (Level 2 Alerts)
// =============================================================================
// Responsabilidad: dado un system_alert recién creado, determinar si debe
// notificarse, por qué canal, y despacharlo — aplicando cooldown anti-spam.
//
// Flujo:
//   system_alerts.insert() → dispatchAlert(alert, orgId, supabase)
//     → leer org.settings.alerts
//     → validar tipo suscrito + severidad mínima
//     → verificar cooldown (no enviar si ya se despachó en los últimos N min)
//     → enviar email (Resend) y/o WhatsApp (Meta API)
//     → fire-and-forget — nunca bloquea el flujo principal
//
// Uso:
//   import { dispatchAlert } from '../services/alertDispatcher.service.js';
//   // Después de insertar en system_alerts:
//   Promise.resolve(dispatchAlert(alertData, orgId, supabase)).catch(() => {});
// =============================================================================

import { Resend }               from 'resend';
import { isWhatsAppConfigured } from './whatsapp.service.js';
import { supabaseAdmin }        from '../config/supabase.js';
import logger                   from '../config/logger.js';

// Jerarquía de severidad (mayor índice = más severo)
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

// Config de alertas por defecto (se aplica si org no tiene settings.alerts)
const DEFAULT_ALERT_CONFIG = {
  enabled:          false,   // deshabilitado por defecto — el owner lo activa
  cooldown_minutes: 60,
  channels: {
    email:    { enabled: false, recipients: [] },
    whatsapp: { enabled: false, phone_numbers: [] },
  },
  subscriptions: {
    low_stock:        { enabled: true,  min_severity: 'high',     channels: ['email'] },
    out_of_stock:     { enabled: true,  min_severity: 'critical', channels: ['email', 'whatsapp'] },
    cash_discrepancy: { enabled: true,  min_severity: 'medium',   channels: ['email'] },
    security_anomaly: { enabled: true,  min_severity: 'high',     channels: ['email', 'whatsapp'] },
    margin_loss:      { enabled: false, min_severity: 'high',     channels: ['email'] },
    inventory_discrepancy: { enabled: true, min_severity: 'high', channels: ['email'] },
  },
};

// Etiquetas legibles para cada tipo de alerta
const ALERT_LABELS = {
  low_stock:             '⚠️ Stock bajo',
  out_of_stock:          '🔴 Producto agotado',
  cash_discrepancy:      '💰 Descuadre de caja',
  security_anomaly:      '🔒 Anomalía de seguridad',
  margin_loss:           '📉 Pérdida de margen',
  inventory_discrepancy: '📦 Discrepancia de inventario',
};

const SEVERITY_LABELS = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };
const SEVERITY_COLORS = { low: '#6b7280', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };


// =============================================================================
// FUNCIÓN PRINCIPAL
// =============================================================================

/**
 * Despacha una alerta a los canales configurados por la organización.
 * Siempre fire-and-forget — nunca lanzar await sobre esta función en el flujo principal.
 *
 * @param {Object} alert         - Datos del alert (campos de system_alerts)
 * @param {string} alert.alert_type
 * @param {string} alert.severity    - 'low' | 'medium' | 'high' | 'critical'
 * @param {string} alert.description
 * @param {string} alert.branch_id   - Opcional
 * @param {Object} alert.metadata    - Datos adicionales del alert (ej. product_name, amount)
 * @param {string} orgId             - organization_id
 * @param {Object} supabase          - Cliente Supabase (con RLS del contexto)
 */
export async function dispatchAlert(alert, orgId, supabase) {
  try {
    // ── 1. Leer configuración de alertas de la organización ──────────────────
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('business_name, email, settings')
      .eq('id', orgId)
      .single();

    if (!org) return;

    const alertConfig = {
      ...DEFAULT_ALERT_CONFIG,
      ...(org.settings?.alerts || {}),
      channels: {
        email:    { ...DEFAULT_ALERT_CONFIG.channels.email,    ...(org.settings?.alerts?.channels?.email    || {}) },
        whatsapp: { ...DEFAULT_ALERT_CONFIG.channels.whatsapp, ...(org.settings?.alerts?.channels?.whatsapp || {}) },
      },
      subscriptions: {
        ...DEFAULT_ALERT_CONFIG.subscriptions,
        ...(org.settings?.alerts?.subscriptions || {}),
      },
    };

    // ── 2. Verificar si las alertas están habilitadas globalmente ────────────
    if (!alertConfig.enabled) return;

    // ── 3. Verificar si este tipo de alerta está suscrito ───────────────────
    const sub = alertConfig.subscriptions[alert.alert_type];
    if (!sub || !sub.enabled) return;

    // ── 4. Verificar severidad mínima ────────────────────────────────────────
    const alertRank   = SEVERITY_RANK[alert.severity]   ?? 0;
    const minRank     = SEVERITY_RANK[sub.min_severity] ?? 0;
    if (alertRank < minRank) return;

    // ── 5. Verificar cooldown (anti-spam) ────────────────────────────────────
    const cooldownMinutes = alertConfig.cooldown_minutes ?? 60;
    const cooldownSince   = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

    const { data: recentAlerts } = await supabaseAdmin
      .from('system_alerts')
      .select('id, created_at')
      .eq('organization_id', orgId)
      .eq('alert_type', alert.alert_type)
      .eq('dispatched', true)
      .gte('created_at', cooldownSince)
      .limit(1);

    if (recentAlerts && recentAlerts.length > 0) {
      logger.info('[AlertDispatcher] Cooldown activo — omitiendo despacho', {
        alert_type: alert.alert_type,
        orgId,
        cooldown_minutes: cooldownMinutes,
      });
      return;
    }

    // ── 6. Determinar canales a usar ─────────────────────────────────────────
    const channels = sub.channels || ['email'];

    // ── 7. Despachar por cada canal ──────────────────────────────────────────
    const results = [];

    if (channels.includes('email') && alertConfig.channels.email.enabled) {
      const emailResult = await sendAlertEmail(alert, org, alertConfig.channels.email);
      results.push({ channel: 'email', ...emailResult });
    }

    if (channels.includes('whatsapp') && alertConfig.channels.whatsapp.enabled && isWhatsAppConfigured()) {
      const waResult = await sendAlertWhatsApp(alert, org, alertConfig.channels.whatsapp);
      results.push({ channel: 'whatsapp', ...waResult });
    }

    // ── 8. Marcar el alert como despachado en system_alerts ──────────────────
    // Requiere que system_alerts tenga columna 'dispatched' boolean (default false).
    // Si no existe aún, este update falla silenciosamente — no bloquea el flujo.
    if (alert.id) {
      await supabaseAdmin
        .from('system_alerts')
        .update({ dispatched: true, dispatched_at: new Date().toISOString() })
        .eq('id', alert.id);
    }

    logger.info('[AlertDispatcher] Alerta despachada', {
      alert_type: alert.alert_type,
      severity:   alert.severity,
      orgId,
      channels:   results.map(r => r.channel),
      results,
    });

  } catch (err) {
    // Nunca propagar errores — las alertas son always fire-and-forget
    logger.error('[AlertDispatcher] Error despachando alerta', { err: err.message, alert_type: alert.alert_type });
  }
}


// =============================================================================
// EMAIL — Resend
// =============================================================================

async function sendAlertEmail(alert, org, emailConfig) {
  const recipients = emailConfig.recipients?.length
    ? emailConfig.recipients
    : [org.email].filter(Boolean);

  if (!recipients.length) {
    return { success: false, error: 'No hay destinatarios de email configurados' };
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { success: false, error: 'RESEND_API_KEY no configurada' };

  const label       = ALERT_LABELS[alert.alert_type]    || `🔔 ${alert.alert_type}`;
  const sevLabel    = SEVERITY_LABELS[alert.severity]   || alert.severity;
  const sevColor    = SEVERITY_COLORS[alert.severity]   || '#6b7280';
  const metaRows    = alert.metadata
    ? Object.entries(alert.metadata)
        .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">${k}</td><td style="padding:6px 12px;font-size:13px;font-weight:500;">${v}</td></tr>`)
        .join('')
    : '';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1f2937,#374151);border-radius:16px 16px 0 0;padding:24px;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;letter-spacing:1px;text-transform:uppercase;">FERZU POS</p>
      <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;">${label}</h1>
    </div>

    <!-- Severity badge -->
    <div style="background:#ffffff;padding:16px 24px;border-left:4px solid ${sevColor};">
      <span style="display:inline-block;background:${sevColor};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px;">
        Severidad: ${sevLabel}
      </span>
      <p style="margin:12px 0 0;color:#111827;font-size:15px;line-height:1.6;">${alert.description || 'Sin descripción adicional.'}</p>
    </div>

    <!-- Metadata -->
    ${metaRows ? `
    <div style="background:#f9fafb;padding:0 24px 16px;">
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        ${metaRows}
      </table>
    </div>` : ''}

    <!-- Footer -->
    <div style="background:#f9fafb;border-radius:0 0 16px 16px;padding:16px 24px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        ${org.business_name} · ${new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:11px;">
        Puedes ajustar tus preferencias de alerta en Ajustes → Notificaciones en FERZU POS.
      </p>
    </div>

  </div>
</body>
</html>`;

  try {
    const resend = new Resend(resendKey);
    const { data, error } = await resend.emails.send({
      from:    process.env.RESEND_FROM_EMAIL || 'FERZU POS <alertas@resend.dev>',
      to:      recipients,
      subject: `${label} — ${org.business_name}`,
      html,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, messageId: data?.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}


// =============================================================================
// WHATSAPP — Meta Cloud API (mensaje de texto libre)
// Nota: requiere que el usuario haya iniciado conversación en las últimas 24h,
// o que se use un template aprobado. Para producción, crear template 'ferzu_alerta'.
// =============================================================================

async function sendAlertWhatsApp(alert, org, waConfig) {
  const numbers = waConfig.phone_numbers || [];
  if (!numbers.length) return { success: false, error: 'No hay números WhatsApp configurados' };

  const token         = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { success: false, error: 'WhatsApp no configurado' };

  const label    = ALERT_LABELS[alert.alert_type] || `🔔 ${alert.alert_type}`;
  const sevLabel = SEVERITY_LABELS[alert.severity] || alert.severity;
  const metaText = alert.metadata
    ? '\n' + Object.entries(alert.metadata).map(([k, v]) => `• ${k}: ${v}`).join('\n')
    : '';

  const text = `${label} — ${org.business_name}\nSeveridad: *${sevLabel}*\n\n${alert.description || ''}${metaText}\n\n_${new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}_`;

  const results = [];
  for (const rawPhone of numbers) {
    const phone     = String(rawPhone).replace(/\D/g, '');
    const fullPhone = phone.startsWith('57') ? phone : `57${phone}`;

    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            messaging_product: 'whatsapp',
            to:                fullPhone,
            type:              'text',
            text:              { body: text },
          }),
        }
      );
      const data = await res.json();
      results.push({ phone: fullPhone, success: res.ok, messageId: data?.messages?.[0]?.id, error: data?.error?.message });
    } catch (err) {
      results.push({ phone: fullPhone, success: false, error: err.message });
    }
  }

  const anySuccess = results.some(r => r.success);
  return { success: anySuccess, results };
}
