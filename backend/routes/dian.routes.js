// =============================================================================
// FERZU POS — DIAN Routes (Facturación Electrónica Inteligente)
// Versión: 1.0.0
// =============================================================================
// Endpoints:
//   POST /api/dian/classify-vat      → IA clasifica tarifa IVA de productos
//   POST /api/dian/batch-classify    → Clasifica hasta 50 productos de golpe
//   POST /api/dian/preflight         → Valida factura ANTES de enviar a DIAN
//   POST /api/dian/explain-error     → Traduce errores DIAN a español claro
//   POST /api/dian/suggest-regime    → Recomienda régimen tributario en onboarding
//   GET  /api/dian/validate-nit/:nit → Valida NIT + calcula dígito verificador
//   GET  /api/dian/resolution-status → Estado de la resolución DIAN activa
//   POST /api/dian/retry-contingency → Reintenta facturas en estado "contingency"
// =============================================================================

import { Router }            from 'express';
import { body }              from 'express-validator';
import { validate }          from '../middleware/validate.js';
import { createClient }      from '@supabase/supabase-js';
import { aiRateLimit }       from '../config/rateLimits.js';
import { requireAuth }       from '../middleware/auth.js';
import {
  classifyProductVAT,
  batchClassifyVAT,
  preflightInvoiceCheck,
  explainDianError,
  suggestTaxRegime,
  validateNIT,
  calculateNITDV,
}                            from '../lib/dianAI.js';
import { triggerElectronicInvoice, checkResolutionExpiry } from '../lib/dian.js';

const router       = Router();
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Aplicar autenticación a TODAS las rutas DIAN.
// requireAuth inyecta req.user, req.organizationId y req.supabase.
// /validate-nit no necesita organizationId pero sí se protege contra abuso.
router.use(requireAuth);

// Middleware: verificar que el usuario tiene organización activa
function requireOrg(req, res, next) {
  if (!req.organizationId) return res.status(401).json({ error: 'No autenticado' });
  next();
}


// Aplicar aiRateLimit a todos los endpoints que llaman a la IA
// (10 req/min por IP — protege el costo de tokens Anthropic)
router.use(['/classify-vat', '/batch-classify', '/preflight', '/explain-error', '/suggest-regime'], aiRateLimit);

// =============================================================================
// POST /api/dian/classify-vat
// Clasifica la tarifa de IVA para 1 o más productos usando IA.
// Body: { products: [{ name, category?, description? }] }
// =============================================================================
router.post('/classify-vat', requireOrg, async (req, res) => {
  try {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'products debe ser un array no vacío' });
    }
    if (products.length > 10) {
      return res.status(400).json({ error: 'Máx 10 productos por llamada. Para lotes grandes usa /batch-classify' });
    }

    const results = await classifyProductVAT(products);
    res.json({ success: true, results });

  } catch (err) {
    console.error('[DIAN] classify-vat error:', err);
    res.status(500).json({ error: 'Error al clasificar IVA', detail: err.message });
  }
});


// =============================================================================
// POST /api/dian/batch-classify
// Clasifica hasta 50 productos en una sola operación (importar CSV, carga masiva).
// Body: { products: [{ name, category?, description? }] }
// =============================================================================
router.post('/batch-classify', requireOrg, async (req, res) => {
  try {
    const { products } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ error: 'products debe ser un array' });
    }
    if (products.length > 50) {
      return res.status(400).json({ error: 'Máx 50 productos por lote' });
    }

    const results = await batchClassifyVAT(products);
    const needsReviewCount = results.filter(r => r.needsReview).length;

    res.json({
      success:           true,
      total:             results.length,
      needsReviewCount,
      results,
    });

  } catch (err) {
    console.error('[DIAN] batch-classify error:', err);
    res.status(500).json({ error: 'Error en clasificación masiva', detail: err.message });
  }
});


// =============================================================================
// POST /api/dian/preflight
// Valida los datos de una factura antes de transmitirla a la DIAN.
// Body: { invoiceData: { issuer, buyer, resolution, invoice, items, totals, environment } }
// =============================================================================
router.post('/preflight', requireOrg, async (req, res) => {
  try {
    const { invoiceData } = req.body;

    if (!invoiceData) {
      return res.status(400).json({ error: 'Falta invoiceData' });
    }

    const result = await preflightInvoiceCheck(invoiceData);
    res.json({ success: true, ...result });

  } catch (err) {
    console.error('[DIAN] preflight error:', err);
    res.status(500).json({ error: 'Error en validación preflight', detail: err.message });
  }
});


// =============================================================================
// POST /api/dian/explain-error
// Traduce errores técnicos del PTA/DIAN a español comprensible.
// Body: { errors: [{ code?, message? }], invoiceNumber? }
// =============================================================================
router.post('/explain-error', requireOrg, async (req, res) => {
  try {
    const { errors, invoiceNumber } = req.body;

    if (!errors || !Array.isArray(errors) || errors.length === 0) {
      return res.status(400).json({ error: 'errors debe ser un array no vacío' });
    }

    const explanations = await explainDianError(errors, invoiceNumber);
    res.json({ success: true, explanations });

  } catch (err) {
    console.error('[DIAN] explain-error error:', err);
    res.status(500).json({ error: 'Error al explicar errores DIAN', detail: err.message });
  }
});


// =============================================================================
// POST /api/dian/suggest-regime
// Recomienda régimen tributario en el wizard de onboarding.
// Body: { businessType, estimatedAnnualRevenue, hasEmployees }
// =============================================================================
router.post('/suggest-regime', requireOrg, async (req, res) => {
  try {
    const { businessType, estimatedAnnualRevenue, hasEmployees } = req.body;

    if (!businessType || estimatedAnnualRevenue === undefined) {
      return res.status(400).json({ error: 'Faltan businessType o estimatedAnnualRevenue' });
    }

    const suggestion = await suggestTaxRegime({ businessType, estimatedAnnualRevenue, hasEmployees: !!hasEmployees });
    res.json({ success: true, suggestion });

  } catch (err) {
    console.error('[DIAN] suggest-regime error:', err);
    res.status(500).json({ error: 'Error al sugerir régimen', detail: err.message });
  }
});


// =============================================================================
// GET /api/dian/validate-nit/:nit
// Valida un NIT colombiano y calcula su dígito verificador.
// No requiere IA — algoritmo determinístico DIAN.
// =============================================================================
router.get('/validate-nit/:nit', async (req, res) => {
  try {
    const nitRaw = req.params.nit.replace(/[^0-9]/g, '');

    // Heurística: NITs colombianos base = 7-9 dígitos → con DV = 8-10 dígitos.
    // Si el input tiene 10+ dígitos, el último es el DV ingresado por el usuario.
    // Si tiene ≤ 9 dígitos, lo tratamos como el NIT base y calculamos el DV.
    const userIncludedDV = nitRaw.length >= 10;
    const nitBase = userIncludedDV ? nitRaw.slice(0, -1) : nitRaw;
    const dv      = calculateNITDV(nitBase);

    // Validar: si el usuario incluyó DV, verificar que coincida; si no, siempre válido
    const isValid = userIncludedDV
      ? Number(nitRaw.slice(-1)) === dv
      : true;

    res.json({
      nit:      nitBase,
      dv,
      isValid,
      formatted: `${nitBase}-${dv}`,
      message:   isValid
        ? `NIT válido: ${nitBase}-${dv}`
        : `NIT inválido — el dígito verificador debería ser ${dv} (ingresaste ${nitRaw.slice(-1)})`,
    });

  } catch (err) {
    res.status(500).json({ error: 'Error validando NIT', detail: err.message });
  }
});


// =============================================================================
// GET /api/dian/resolution-status
// Estado de la resolución DIAN activa: días restantes, números disponibles, alertas.
// =============================================================================
router.get('/resolution-status', requireOrg, async (req, res) => {
  try {
    const result = await checkResolutionExpiry(req.organizationId);
    if (!result) {
      return res.json({ configured: false, message: 'No hay configuración DIAN activa para esta organización' });
    }
    res.json({ configured: true, ...result });

  } catch (err) {
    console.error('[DIAN] resolution-status error:', err);
    res.status(500).json({ error: 'Error consultando estado de resolución', detail: err.message });
  }
});


// =============================================================================
// POST /api/dian/retry-contingency
// Reintenta facturas que quedaron en estado "contingency" por error de red/PTA.
// Body: { orderId? } — si se omite, reintenta TODAS las contingencias de la org
// =============================================================================
router.post('/retry-contingency', requireOrg, async (req, res) => {
  try {
    const { orderId } = req.body;

    // Buscar facturas en contingencia
    let query = supabaseAdmin
      .from('electronic_invoices')
      .select('*')
      .eq('organization_id', req.organizationId)
      .eq('dian_status', 'contingency')
      .order('issued_at', { ascending: true })
      .limit(10); // Máx 10 a la vez para no saturar

    if (orderId) query = query.eq('order_id', orderId);

    const { data: contingencies, error } = await query;
    if (error) throw error;

    if (!contingencies || contingencies.length === 0) {
      return res.json({ success: true, retried: 0, message: 'No hay facturas en contingencia' });
    }

    // Reintentar cada una
    const retryResults = [];
    for (const inv of contingencies) {
      try {
        const result = await triggerElectronicInvoice(inv.order_id, req.organizationId);
        retryResults.push({ invoiceNumber: inv.invoice_number, success: true, ...result });
      } catch (err) {
        retryResults.push({ invoiceNumber: inv.invoice_number, success: false, error: err.message });
      }
    }

    const successCount = retryResults.filter(r => r.success).length;

    res.json({
      success:      true,
      retried:      contingencies.length,
      succeeded:    successCount,
      failed:       contingencies.length - successCount,
      results:      retryResults,
    });

  } catch (err) {
    console.error('[DIAN] retry-contingency error:', err);
    res.status(500).json({ error: 'Error reintentando contingencias', detail: err.message });
  }
});


// =============================================================================
// GET /api/dian/config
// Obtiene la configuración DIAN activa de la organización (para el wizard).
// =============================================================================
router.get('/config', requireOrg, async (req, res) => {
  try {
    const { data: config } = await supabaseAdmin
      .from('dian_configs')
      .select('*')
      .eq('organization_id', req.organizationId)
      .eq('is_active', true)
      .maybeSingle();

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('nit, nit_dv, legal_name, name')
      .eq('id', req.organizationId)
      .single();

    res.json({ config: config || null, org: org || null });
  } catch (err) {
    console.error('[DIAN] config error:', err);
    res.status(500).json({ error: 'Error consultando configuración DIAN' });
  }
});


// =============================================================================
// POST /api/dian/setup
// Guarda/actualiza la configuración DIAN completa (wizard post-pago).
// Body: { nit, nit_dv, resolution_number, prefix, from_number, to_number,
//         resolution_date, resolution_end_date, pta_provider, environment }
// =============================================================================
router.post('/setup', requireOrg, [
  body('resolution_number').notEmpty().trim(),
  body('from_number').isInt({ min: 1 }),
  body('to_number').isInt({ min: 1 }),
  body('resolution_end_date').isISO8601(),
  validate,
], async (req, res) => {
  try {
    const {
      nit, nit_dv,
      resolution_number, prefix,
      from_number, to_number,
      resolution_date, resolution_end_date,
      pta_provider, environment,
    } = req.body;

    // Actualizar NIT en organizations si se proporcionó
    if (nit) {
      await supabaseAdmin
        .from('organizations')
        .update({ nit: String(nit).trim(), nit_dv: String(nit_dv ?? '') })
        .eq('id', req.organizationId);
    }

    // Desactivar config anterior si existe
    await supabaseAdmin
      .from('dian_configs')
      .update({ is_active: false })
      .eq('organization_id', req.organizationId);

    // Insertar nueva configuración
    const { data: newConfig, error } = await supabaseAdmin
      .from('dian_configs')
      .insert({
        organization_id:     req.organizationId,
        resolution_number:   String(resolution_number).trim(),
        prefix:              prefix ? String(prefix).trim() : null,
        from_number:         Number(from_number),
        to_number:           Number(to_number),
        current_number:      Number(from_number),   // iniciar en el primer número
        resolution_date:     resolution_date || null,
        resolution_end_date: resolution_end_date,
        pta_provider:        pta_provider || null,
        environment:         environment || 'test',
        is_active:           true,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, config: newConfig });
  } catch (err) {
    console.error('[DIAN] setup error:', err);
    res.status(500).json({ error: 'Error guardando configuración DIAN', detail: err.message });
  }
});


// POST /api/dian/vat-audit-log
// Registra la decisión del usuario sobre la sugerencia del clasificador IVA.
// Permite medir tasa de override para detectar sesgo o errores sistemáticos.
// Gobernanza IA — ISO/IEC 42001 Anexo A, Inventario AI-001.
router.post('/vat-audit-log', requireOrg, [
  body('product_name').notEmpty().isLength({ max: 200 }),
  body('suggested_rate').isIn([0, 5, 8, 19]),
  body('final_rate').isIn([0, 5, 8, 19]),
  body('was_overridden').isBoolean(),
  body('confidence').optional().isIn(['high', 'medium', 'low']),
  validate,
], async (req, res) => {
  try {
    const { product_name, suggested_rate, final_rate, was_overridden, confidence } = req.body;

    await supabaseAdmin.from('audit_log').insert({
      organization_id: req.organizationId,
      user_id:         req.user.id,
      action:          'ai_vat_classification',
      resource_type:   'vat_classifier',
      resource_id:     null,
      old_values:      null,
      new_values: {
        product_name:   product_name,
        suggested_rate: suggested_rate,
        final_rate:     final_rate,
        was_overridden: was_overridden,
        confidence:     confidence || null,
        model:          'AI-001',
      },
    });

    res.status(204).end();
  } catch (err) {
    // No fallar la UX por un error de log
    console.warn('[DIAN] vat-audit-log error (non-critical):', err.message);
    res.status(204).end();
  }
});

export default router;
