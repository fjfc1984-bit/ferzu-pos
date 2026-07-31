// =============================================================================
// FERZU POS — Inventory AI  (backend/lib/inventoryAI.js)
// =============================================================================
// Analiza stock + historial de ventas y genera alertas inteligentes con IA.
//
// FUNCIONES EXPORTADAS:
//   analyzeInventory(products, salesMap, options?) → { insights, stats, summary }
//
// TIPOS DE ALERTA:
//   critical_stock — < 3 días de stock al ritmo actual de ventas
//   low_stock      — < 7 días de stock
//   dead_stock     — sin ventas en 30+ días y stock > 0
//   overstock      — stock para más de 90 días (capital inmovilizado)
//
// NOTAS:
//   - Usa claude-haiku para generar el resumen narrativo (rápido y barato)
//   - Los cálculos de métricas son deterministas (no dependen de IA)
//   - Si Anthropic falla, devuelve igual el análisis sin el summary
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  FAST: 'claude-haiku-4-5-20251001',
};

// Días de análisis hacia atrás para calcular velocidad de ventas
const ANALYSIS_WINDOW_DAYS = 30;

// Umbrales de alerta (en días de stock restantes)
const THRESHOLDS = {
  CRITICAL: 3,   // < 3 días → crítico
  LOW:      7,   // < 7 días → bajo
  OVERSTOCK: 90, // > 90 días → sobrestock
};

// Días sin ventas para considerar un producto "muerto"
const DEAD_STOCK_DAYS = 30;

// =============================================================================
// analyzeInventory
// =============================================================================
// @param products  Array de { id, name, sku, cost_price, min_stock, stock }
//                  donde stock = cantidad actual en inventario
// @param salesMap  Map<productId, { totalQty: number, lastSaleDate: string }>
//                  vendido en los últimos ANALYSIS_WINDOW_DAYS días
// @param options   { currency: 'COP', skipAI: false }
// @returns         { insights, stats, summary, generatedAt }
// =============================================================================
export async function analyzeInventory(products, salesMap, options = {}) {
  const { currency = 'COP', skipAI = false } = options;

  const insights = [];

  for (const product of products) {
    const stock     = product.stock ?? 0;
    const salesData = salesMap.get(product.id) || { totalQty: 0, lastSaleDate: null };
    const { totalQty, lastSaleDate } = salesData;

    // ── Velocidad de ventas diaria promedio ────────────────────────────────
    const avgDailySales = totalQty / ANALYSIS_WINDOW_DAYS;

    // ── Días de stock restantes ────────────────────────────────────────────
    // Si no hay ventas recientes → ∞ (no calculamos días)
    const daysOfStock = avgDailySales > 0
      ? Math.round((stock / avgDailySales) * 10) / 10
      : null;

    // ── Días desde la última venta ─────────────────────────────────────────
    const daysSinceLastSale = lastSaleDate
      ? Math.floor((Date.now() - new Date(lastSaleDate).getTime()) / 86_400_000)
      : null;

    // ── Valor del stock muerto ─────────────────────────────────────────────
    const stockValue = stock * (product.cost_price || 0);

    // ── Clasificar alerta ──────────────────────────────────────────────────
    let type     = null;
    let severity = null;
    let message  = null;
    let suggestedReorder = null;

    if (stock > 0 && avgDailySales === 0 && daysSinceLastSale !== null && daysSinceLastSale >= DEAD_STOCK_DAYS) {
      // Producto con stock pero sin ventas en 30+ días
      type     = 'dead_stock';
      severity = 'warning';
      message  = `Sin movimiento hace ${daysSinceLastSale} días. ¿Considerar liquidación o reubicación?`;

    } else if (daysOfStock !== null && daysOfStock < THRESHOLDS.CRITICAL) {
      // Menos de 3 días
      type     = 'critical_stock';
      severity = 'critical';
      message  = `Stock crítico: ~${daysOfStock.toFixed(1)} días restantes al ritmo actual`;
      // Sugerir reorden para 30 días hacia adelante
      suggestedReorder = Math.ceil(avgDailySales * 30 - stock);

    } else if (daysOfStock !== null && daysOfStock < THRESHOLDS.LOW) {
      // Entre 3 y 7 días
      type     = 'low_stock';
      severity = 'warning';
      message  = `Stock bajo: ~${daysOfStock.toFixed(1)} días restantes`;
      suggestedReorder = Math.ceil(avgDailySales * 30 - stock);

    } else if (daysOfStock !== null && daysOfStock > THRESHOLDS.OVERSTOCK && stockValue > 0) {
      // Más de 90 días de stock acumulado
      type     = 'overstock';
      severity = 'info';
      message  = `Sobrestock: tienes ~${Math.round(daysOfStock)} días de inventario (capital inmovilizado: ${formatCOP(stockValue, currency)})`;

    } else if (stock === 0 && avgDailySales > 0) {
      // Sin stock pero con demanda activa
      type     = 'critical_stock';
      severity = 'critical';
      message  = `Sin stock disponible. Vendías ${avgDailySales.toFixed(1)} unidades/día — pérdida de ventas activa`;
      suggestedReorder = Math.ceil(avgDailySales * 30);
    }

    // Solo agregar si hay una alerta real
    if (type) {
      insights.push({
        type,
        severity,
        productId:       product.id,
        productName:     product.name,
        sku:             product.sku || null,
        currentStock:    stock,
        avgDailySales:   Math.round(avgDailySales * 100) / 100,
        daysOfStock,
        lastSaleDate,
        daysSinceLastSale,
        stockValue,
        message,
        suggestedReorder: suggestedReorder ? Math.max(0, suggestedReorder) : null,
        minStock:        product.min_stock || null,
      });
    }
  }

  // ── Ordenar: críticos primero, luego advertencias, luego info ─────────────
  const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
  insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // ── Estadísticas generales ────────────────────────────────────────────────
  const stats = {
    totalProducts:  products.length,
    criticalCount:  insights.filter(i => i.severity === 'critical').length,
    warningCount:   insights.filter(i => i.severity === 'warning').length,
    infoCount:      insights.filter(i => i.severity === 'info').length,
    deadStockCount: insights.filter(i => i.type === 'dead_stock').length,
    deadStockValue: insights
      .filter(i => i.type === 'dead_stock')
      .reduce((sum, i) => sum + i.stockValue, 0),
  };

  // ── Resumen narrativo con IA ───────────────────────────────────────────────
  let summary = null;
  if (!skipAI && insights.length > 0) {
    summary = await generateSummary(insights, stats, currency);
  } else if (insights.length === 0) {
    summary = 'Tu inventario está en buen estado. No hay alertas activas en este momento.';
  }

  return {
    generatedAt: new Date().toISOString(),
    summary,
    stats,
    insights,
  };
}

// =============================================================================
// generateSummary — narrativa ejecutiva con Claude Haiku
// =============================================================================
async function generateSummary(insights, stats, currency) {
  try {
    // Preparar resumen compacto para el prompt (evitar tokens innecesarios)
    const criticals  = insights.filter(i => i.severity === 'critical').slice(0, 5);
    const warnings   = insights.filter(i => i.severity === 'warning' && i.type !== 'dead_stock').slice(0, 3);
    const deadStocks = insights.filter(i => i.type === 'dead_stock').slice(0, 3);

    const prompt = `Eres el asistente de inventario de FERZU POS, un sistema POS para negocios colombianos.
Genera un resumen ejecutivo breve (máx 3 oraciones) sobre el estado del inventario en ESPAÑOL, dirigido al dueño del negocio.
Usa un tono directo y accionable. Menciona los números más importantes. No uses bullet points.

DATOS:
- Total de productos analizados: ${stats.totalProducts}
- Alertas críticas (sin stock / < 3 días): ${stats.criticalCount}
- Advertencias (< 7 días o stock muerto): ${stats.warningCount}
- Sobrestock: ${stats.infoCount}
- Productos sin movimiento: ${stats.deadStockCount} (capital inmovilizado: ${formatCOP(stats.deadStockValue, currency)})

PRODUCTOS CRÍTICOS:
${criticals.map(p => `- "${p.productName}": ${p.message}`).join('\n') || 'Ninguno'}

ADVERTENCIAS RELEVANTES:
${warnings.map(p => `- "${p.productName}": ${p.message}`).join('\n') || 'Ninguna'}

STOCK MUERTO:
${deadStocks.map(p => `- "${p.productName}": ${p.message}`).join('\n') || 'Ninguno'}

Escribe el resumen ejecutivo ahora:`;

    const response = await anthropic.messages.create({
      model:      MODELS.FAST,
      max_tokens: 200,
      messages:   [{ role: 'user', content: prompt }],
    });

    return response.content[0]?.text?.trim() || null;

  } catch (err) {
    console.error('[inventoryAI] generateSummary error:', err.message);
    // Fallback sin IA
    const parts = [];
    if (stats.criticalCount > 0) parts.push(`${stats.criticalCount} producto(s) en nivel crítico`);
    if (stats.warningCount  > 0) parts.push(`${stats.warningCount} con stock bajo`);
    if (stats.deadStockCount > 0) parts.push(`${stats.deadStockCount} sin movimiento`);
    return parts.length > 0
      ? `Resumen: ${parts.join(', ')}. Revisa las alertas a continuación.`
      : null;
  }
}

// =============================================================================
// Helpers
// =============================================================================
function formatCOP(amount, currency) {
  if (!amount || amount === 0) return '$0';
  return new Intl.NumberFormat('es-CO', {
    style:    'currency',
    currency: currency || 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
