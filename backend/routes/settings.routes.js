// =============================================================================
// FERZU POS — Settings Routes
// Configuración de la organización: WhatsApp, notificaciones, preferencias
// =============================================================================
//   GET  /api/settings              → config actual (sin secrets)
//   PATCH /api/settings/whatsapp    → guardar config WhatsApp
//   POST  /api/settings/whatsapp/test → enviar mensaje de prueba
// =============================================================================

import { Router }         from 'express';
import { body }           from 'express-validator';
import { validate }       from '../middleware/validate.js';
import { requireAuth }    from '../middleware/auth.js';
import { supabaseAdmin }  from '../config/supabase.js';
import logger             from '../config/logger.js';
import { sendTestWhatsApp,
         isWhatsAppConfigured } from '../services/whatsapp.service.js';

const router = Router();

router.use(requireAuth);

function requireOrg(req, res, next) {
  if (!req.organizationId) return res.status(401).json({ error: 'No autenticado' });
  next();
}


// =============================================================================
// GET /api/settings
// Obtiene la configuración actual de la organización.
// No devuelve tokens — solo indica si están configurados.
// =============================================================================
router.get('/', requireOrg, async (req, res) => {
  try {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, legal_name, nit, nit_dv, email, settings')
      .eq('id', req.organizationId)
      .single();

    const settings = org?.settings || {};

    res.json({
      org: {
        name:       org?.name,
        legal_name: org?.legal_name,
        nit:        org?.nit,
        nit_dv:     org?.nit_dv,
        email:      org?.email,
      },
      whatsapp: {
        configured:      isWhatsAppConfigured(),
        // Mostrar últimos 4 caracteres del token si existe (proof sin exponer)
        tokenPreview:    process.env.WHATSAPP_TOKEN
                           ? `···${process.env.WHATSAPP_TOKEN.slice(-4)}`
                           : null,
        phoneNumberId:   process.env.WHATSAPP_PHONE_NUMBER_ID || null,
        templateName:    process.env.WHATSAPP_TEMPLATE_NAME   || 'ferzu_recibo',
        // Config custom guardada en org.settings (sobrescribe env vars)
        customPhone:     settings.whatsapp_phone    || null,
        autoSendReceipt: settings.whatsapp_auto     ?? true,
      },
    });
  } catch (err) {
    logger.error('[Settings] GET error:', { err: err.message });
    res.status(500).json({ error: 'Error obteniendo configuración' });
  }
});


// =============================================================================
// PATCH /api/settings/whatsapp
// Guarda preferencias de WhatsApp en org.settings (NO guarda el token — va en Railway).
// Body: { auto_send_receipt?: boolean, custom_phone?: string }
// =============================================================================
router.patch('/whatsapp', requireOrg, [
  body('auto_send_receipt').optional().isBoolean(),
  body('custom_phone').optional().isMobilePhone().withMessage('Número de teléfono inválido'),
  validate,
], async (req, res) => {
  try {
    const { auto_send_receipt, custom_phone } = req.body;

    // Leer settings actuales
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('settings')
      .eq('id', req.organizationId)
      .single();

    const current = org?.settings || {};
    const updated = {
      ...current,
      whatsapp_auto:  auto_send_receipt ?? current.whatsapp_auto ?? true,
      whatsapp_phone: custom_phone      ?? current.whatsapp_phone ?? null,
    };

    const { error } = await supabaseAdmin
      .from('organizations')
      .update({ settings: updated })
      .eq('id', req.organizationId);

    if (error) throw error;

    res.json({ success: true, settings: { whatsapp: updated } });
  } catch (err) {
    logger.error('[Settings] PATCH whatsapp error:', { err: err.message });
    res.status(500).json({ error: 'Error guardando configuración WhatsApp' });
  }
});


// =============================================================================
// POST /api/settings/whatsapp/test
// Envía un mensaje de prueba al número indicado.
// Body: { phone }
// =============================================================================
router.post('/whatsapp/test', requireOrg, [
  body('phone').notEmpty().withMessage('Número requerido'),
  validate,
], async (req, res) => {
  try {
    if (!isWhatsAppConfigured()) {
      return res.status(400).json({
        error: 'WhatsApp no configurado. Agrega WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en las variables de Railway.',
      });
    }

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', req.organizationId)
      .single();

    const result = await sendTestWhatsApp(req.body.phone, org?.name);

    if (result.success) {
      res.json({ success: true, messageId: result.messageId, message: 'Mensaje de prueba enviado exitosamente' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    logger.error('[Settings] whatsapp/test error:', { err: err.message });
    res.status(500).json({ error: 'Error enviando mensaje de prueba' });
  }
});

export default router;
