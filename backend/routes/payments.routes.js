// =============================================================================
// FERZU POS — Payments Routes
//
// POST /api/payments/create-bold-session  — Crea sesión de pago Bold
// POST /webhooks/bold                     — Webhook de confirmación Bold
//
// REGLA DE ORO: El backend calcula el monto. El frontend nunca envía precios.
// =============================================================================
import express from 'express';
import crypto  from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Resend } from 'resend';
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../config/logger.js';
import { requireAuth }   from '../middleware/auth.js';

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const PLAN_PRICES_COP = {
  pos_basic:   49_000,
  barbershop:  79_000,
  workshop:    79_000,
  minimarket:  79_000,
  restaurant:  89_000,
  pro:        149_000,
};

const PLAN_NAMES = {
  pos_basic:  'FERZU POS Básico',
  barbershop: 'FERZU POS Barbería',
  workshop:   'FERZU POS Taller',
  minimarket: 'FERZU POS Minimarket',
  restaurant: 'FERZU POS Restaurante',
  pro:        'FERZU POS Pro',
};

// POST /api/payments/create-bold-session
router.post('/create-bold-session', requireAuth, async (req, res) => {
  const { planId, organizationId } = req.body;

  if (!planId || !organizationId) {
    return res.status(400).json({ error: 'planId y organizationId son requeridos' });
  }

  const amountCOP = PLAN_PRICES_COP[planId];
  if (!amountCOP) {
    return res.status(400).json({ error: `Plan inválido: ${planId}` });
  }

  // Verificar que el usuario pertenece a esta organización
  const { data: userRow, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', req.user.id)
    .eq('organization_id', organizationId)
    .single();

  if (userErr || !userRow) {
    return res.status(403).json({ error: 'No tienes acceso a esta organización' });
  }

  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('id, business_name, email')
    .eq('id', organizationId)
    .single();

  if (orgErr || !org) {
    return res.status(403).json({ error: 'Organización no encontrada' });
  }

  let customerEmail = '';
  try {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
    customerEmail = user?.email || '';
  } catch { /* no crítico */ }

  const orderId = uuidv4();

  logger.info('[BOLD] Sesión de pago creada', { orgId: organizationId, planId, amountCOP, orderId });

  return res.json({
    orderId,
    amountCOP,
    description:   `${PLAN_NAMES[planId] || planId} — ${org.business_name}`,
    customerEmail,
  });
});

// =============================================================================
// Verificación de firma HMAC-SHA256 de Bold
// =============================================================================
const BOLD_SECRET_KEY = process.env.BOLD_SECRET_KEY || '';

function verifyBoldSignature(rawBody, signatureHeader) {
  if (!BOLD_SECRET_KEY) {
    // En producción esto es un riesgo crítico — cualquier webhook sería aceptado
    if (process.env.NODE_ENV === 'production') {
      logger.error('[BOLD] BOLD_SECRET_KEY no configurada en producción — rechazando webhook por seguridad');
      return false;  // FIX: rechazar en producción si no hay key
    }
    logger.warn('[BOLD] BOLD_SECRET_KEY no configurada — firma no verificada (solo en dev)');
    return true; // permisivo solo en desarrollo local
  }
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', BOLD_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signatureHeader.replace(/^sha256=/, ''), 'hex')
    );
  } catch {
    return false;
  }
}

// POST /webhooks/bold
// No requiere JWT — Bold llama desde sus servidores.
// La seguridad la provee la verificación HMAC-SHA256.
// Registrado con express.raw() para poder leer el rawBody antes del JSON.parse.
// Montado en /webhooks por server.js → path efectivo: POST /webhooks/bold
router.post('/bold', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody      = req.body;
  const signatureHdr = req.headers['x-bold-signature'] || req.headers['x-signature'] || '';

  if (!verifyBoldSignature(rawBody, signatureHdr)) {
    logger.warn('[BOLD] Firma inválida — webhook rechazado', {
      ip:        req.ip,
      signature: signatureHdr?.substring(0, 30),
    });
    return res.status(401).json({ error: 'Firma inválida' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  const { type: eventType, data } = event;

  logger.info('[BOLD] Webhook recibido', {
    eventType,
    transactionId: data?.id || data?.transaction_id,
  });

  if (eventType !== 'TRANSACTION_UPDATED') {
    return res.json({ received: true, action: 'ignored' });
  }

  const { status, metadata = {} } = data || {};

  if (status !== 'APPROVED') {
    logger.info('[BOLD] Transacción no aprobada', { status, id: data?.id });
    return res.json({ received: true, action: 'noop', status });
  }

  const orgId  = metadata.organization_id || metadata.org_id;
  const planId = metadata.plan_id || metadata.plan;

  if (!orgId || !planId) {
    logger.error('[BOLD] Metadata incompleta', { metadata });
    return res.status(422).json({ error: 'Metadata incompleta: organization_id y plan_id son requeridos' });
  }

  try {
    const now       = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .upsert({
        organization_id:      orgId,
        plan_id:              planId,
        status:               'active',
        bold_transaction_id:  data.id || data.transaction_id,
        current_period_start: now.toISOString(),
        current_period_end:   periodEnd.toISOString(),
        updated_at:           now.toISOString(),
      }, { onConflict: 'organization_id' });

    if (subError) {
      logger.error('[BOLD] Error actualizando subscripción', { error: subError.message, orgId });
      return res.status(500).json({ error: 'Error interno actualizando suscripción' });
    }

    const { error: orgUpdateError } = await supabaseAdmin
      .from('organizations')
      .update({ plan_id: planId, plan_expires_at: periodEnd.toISOString() })
      .eq('id', orgId);

    if (orgUpdateError) {
      logger.warn('[BOLD] Error actualizando plan_id en organizations', { error: orgUpdateError.message, orgId });
    }

    // Email de confirmación (best-effort) — usa columna email de organizations
    ;(async () => {
      try {
        const { data: orgData } = await supabaseAdmin
          .from('organizations')
          .select('business_name, email')
          .eq('id', orgId)
          .single();

        const recipientEmail = orgData?.email;
        if (recipientEmail) {
          await resend.emails.send({
            from:    process.env.RESEND_FROM_EMAIL || 'FERZU POS <onboarding@resend.dev>',
            to:      recipientEmail,
            subject: `✅ Plan ${PLAN_NAMES[planId] || planId} activado — FERZU POS`,
            html: `
              <div style="font-family:Arial,sans-serif;background:#0a0f1a;color:#d1fae5;padding:40px;border-radius:12px;max-width:480px;">
                <h2 style="color:#10b981;">¡Suscripción activada! 🎉</h2>
                <p>Hola <strong>${orgData.business_name}</strong>,</p>
                <p>Tu plan <strong style="color:#10b981;">${PLAN_NAMES[planId] || planId}</strong> está activo hasta el
                   <strong>${periodEnd.toLocaleDateString('es-CO')}</strong>.</p>
                <p>Transacción Bold: <code style="color:#6ee7b7;">${data.id || data.transaction_id}</code></p>
                <a href="https://ferzu-pos.vercel.app/pos"
                   style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;margin-top:16px;font-weight:700;">
                  Ir al POS →
                </a>
              </div>`,
          });
          logger.info('[BOLD] Email de confirmación enviado', { email: recipientEmail, orgId });
        }
      } catch (emailErr) {
        logger.warn('[BOLD] Error enviando email de confirmación', { error: emailErr.message });
      }
    })();

    logger.info('[BOLD] Plan activado exitosamente', { orgId, planId, transactionId: data.id });
    return res.json({ received: true, action: 'plan_activated', orgId, planId });
  } catch (err) {
    logger.error('[BOLD] Error inesperado procesando webhook', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
