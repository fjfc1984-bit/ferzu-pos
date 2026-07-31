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
import { createClient }      from '@supabase/supabase-js';
import { aiRateLimit }       from '../config/rateLimits.js';
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

// Middleware: verificar autenticación (req.organizationId se setea en auth middleware global)
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


export default router;
