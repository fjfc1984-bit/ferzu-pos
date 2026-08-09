// =============================================================================
// FERZU POS — Retention Routes
// Módulo de Retención y Reactivación de Clientes
// =============================================================================
//   GET  /api/retention/segments         → clientes segmentados (activos, en riesgo, dormidos, VIP)
//   GET  /api/retention/birthdays        → cumpleaños hoy + esta semana
//   GET  /api/retention/stats            → métricas de retención de la org
//   POST /api/retention/generate-message → generar mensaje WhatsApp con IA
// =============================================================================

import { Router } from 'express';
import { body, query } from 'express-validator';
import { validate }    from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../config/logger.js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
router.use(requireAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Helpers de segmentación
// ---------------------------------------------------------------------------
const DAYS_ACTIVE    = 30;   // última compra ≤ 30 días → Activo
const DAYS_RISK      = 60;   // última compra 31-60 días → En riesgo
// > 60 días → Dormido
// VIP: top 10% por gasto O ≥ 10 visitas

function classifyCustomer(daysSinceLastOrder, orderCount, totalSpent, avgSpentThreshold) {
  const isVip = totalSpent >= avgSpentThreshold || orderCount >= 10;
  if (daysSinceLastOrder === null) return 'dormido'; // nunca compró
  if (isVip) return 'vip';
  if (daysSinceLastOrder <= DAYS_ACTIVE) return 'activo';
  if (daysSinceLastOrder <= DAYS_RISK)   return 'en_riesgo';
  return 'dormido';
}

// =============================================================================
// GET /api/retention/segments
// Retorna todos los clientes de la org con su segmento calculado
// =============================================================================
router.get('/segments', async (req, res) => {
  try {
    const orgId    = req.organizationId;
    const branchId = req.query.branch_id || null;

    // 1. Traer todos los clientes de la org
    const { data: customers, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('id, full_name, phone, email, birth_date, created_at')
      .eq('organization_id', orgId)
      .order('full_name');

    if (custErr) throw custErr;
    if (!customers?.length) return res.json({ segments: {}, stats: {}, customers: [] });

    const customerIds = customers.map(c => c.id);

    // 2. Última orden + count + total por cliente
    let ordersQuery = supabaseAdmin
      .from('orders')
      .select('customer_id, total, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .in('customer_id', customerIds);

    if (branchId) ordersQuery = ordersQuery.eq('branch_id', branchId);

    const { data: orders, error: ordErr } = await ordersQuery;
    if (ordErr) throw ordErr;

    // 3. Agrupar estadísticas por cliente
    const now = new Date();
    const statsMap = {};

    for (const o of orders || []) {
      if (!o.customer_id) continue;
      if (!statsMap[o.customer_id]) {
        statsMap[o.customer_id] = { lastOrder: null, orderCount: 0, totalSpent: 0 };
      }
      const s = statsMap[o.customer_id];
      s.orderCount++;
      s.totalSpent += (o.total || 0);
      const oDate = new Date(o.created_at);
      if (!s.lastOrder || oDate > s.lastOrder) s.lastOrder = oDate;
    }

    // 4. Calcular umbral VIP (top 10% de gasto)
    const spends = Object.values(statsMap).map(s => s.totalSpent).sort((a, b) => b - a);
    const vipThreshold = spends[Math.floor(spends.length * 0.10)] || 500000;

    // 5. Clasificar cada cliente
    const result = customers.map(c => {
      const s = statsMap[c.id] || { lastOrder: null, orderCount: 0, totalSpent: 0 };
      const daysSince = s.lastOrder
        ? Math.floor((now - s.lastOrder) / (1000 * 60 * 60 * 24))
        : null;

      const segment = classifyCustomer(daysSince, s.orderCount, s.totalSpent, vipThreshold);

      return {
        id: c.id,
        full_name: c.full_name,
        phone: c.phone,
        email: c.email,
        birth_date: c.birth_date,
        segment,
        days_since_last_order: daysSince,
        order_count: s.orderCount,
        total_spent: s.totalSpent,
        last_order_date: s.lastOrder ? s.lastOrder.toISOString() : null,
      };
    });

    // 6. Agrupar por segmento
    const segments = { activo: [], en_riesgo: [], dormido: [], vip: [] };
    for (const c of result) segments[c.segment]?.push(c);

    // 7. Stats globales
    const stats = {
      total_customers: customers.length,
      activos: segments.activo.length,
      en_riesgo: segments.en_riesgo.length,
      dormidos: segments.dormido.length,
      vip: segments.vip.length,
      retention_rate: customers.length > 0
        ? Math.round((segments.activo.length / customers.length) * 100)
        : 0,
      avg_days_between_visits: (() => {
        const vals = result.filter(c => c.days_since_last_order !== null && c.order_count > 1)
          .map(c => c.days_since_last_order);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      })(),
    };

    logger.info(`[retention] Segmentos org ${orgId}: activos=${stats.activos} en_riesgo=${stats.en_riesgo} dormidos=${stats.dormidos} vip=${stats.vip}`);
    res.json({ segments, stats });

  } catch (err) {
    logger.error('[retention] Error en /segments:', err.message);
    res.status(500).json({ error: 'Error calculando segmentos' });
  }
});

// =============================================================================
// GET /api/retention/birthdays
// Clientes con cumpleaños hoy + esta semana
// =============================================================================
router.get('/birthdays', async (req, res) => {
  try {
    const orgId = req.organizationId;

    const { data: customers, error } = await supabaseAdmin
      .from('customers')
      .select('id, full_name, phone, email, birth_date')
      .eq('organization_id', orgId)
      .not('birth_date', 'is', null);

    if (error) throw error;

    const now    = new Date();
    const today  = { month: now.getMonth() + 1, day: now.getDate() };
    const in7    = new Date(now);
    in7.setDate(in7.getDate() + 7);

    const todayList  = [];
    const weekList   = [];

    for (const c of customers || []) {
      if (!c.birth_date) continue;
      const [, mm, dd] = c.birth_date.split('-').map(Number);

      const isToday = mm === today.month && dd === today.day;
      if (isToday) { todayList.push(c); continue; }

      // Verificar si cae en los próximos 7 días (sin importar el año)
      const thisYearBirthday = new Date(now.getFullYear(), mm - 1, dd);
      if (thisYearBirthday >= now && thisYearBirthday <= in7) {
        const daysUntil = Math.floor((thisYearBirthday - now) / (1000 * 60 * 60 * 24));
        weekList.push({ ...c, days_until: daysUntil });
      }
    }

    weekList.sort((a, b) => a.days_until - b.days_until);
    res.json({ today: todayList, this_week: weekList });

  } catch (err) {
    logger.error('[retention] Error en /birthdays:', err.message);
    res.status(500).json({ error: 'Error calculando cumpleaños' });
  }
});

// =============================================================================
// POST /api/retention/generate-message
// Genera mensaje WhatsApp personalizado con IA
// Body: { customer_id, type: 'reactivation'|'birthday'|'vip'|'risk', business_name? }
// =============================================================================
router.post('/generate-message', [
  body('customer_id').notEmpty(),
  body('type').isIn(['reactivation', 'birthday', 'vip', 'risk']),
  validate,
], async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { customer_id, type, business_name } = req.body;

    // Traer info del cliente
    const { data: customer, error: cErr } = await supabaseAdmin
      .from('customers')
      .select('id, full_name, phone, birth_date')
      .eq('id', customer_id)
      .eq('organization_id', orgId)
      .single();

    if (cErr || !customer) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Traer stats del cliente
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('total, created_at')
      .eq('customer_id', customer_id)
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10);

    const orderCount  = orders?.length || 0;
    const totalSpent  = orders?.reduce((s, o) => s + (o.total || 0), 0) || 0;
    const lastOrder   = orders?.[0]?.created_at;
    const now         = new Date();
    const daysSince   = lastOrder
      ? Math.floor((now - new Date(lastOrder)) / (1000 * 60 * 60 * 24))
      : null;

    const bizName = business_name || 'tu negocio de confianza';

    const PROMPTS = {
      reactivation: `Genera un mensaje de WhatsApp corto y amigable (máx 3 párrafos) para reactivar a un cliente que lleva ${daysSince} días sin visitar ${bizName}.
        Cliente: ${customer.full_name}. Total visitas: ${orderCount}. Total gastado: $${totalSpent.toLocaleString('es-CO')} COP.
        El mensaje debe: mencionar su nombre, el tiempo que lleva sin visitarnos, expresar que lo extrañamos, y ofrecer una razón para volver (puede ser una promoción genérica que el negocio puede personalizar).
        Tono: cercano, cálido, sin presión. Solo el texto del mensaje, sin explicaciones adicionales.`,
      birthday: `Genera un mensaje de WhatsApp de felicitación de cumpleaños para un cliente de ${bizName}.
        Cliente: ${customer.full_name}. Es un cliente con ${orderCount} visitas.
        El mensaje debe: saludar por nombre, felicitar por el cumpleaños, ofrecer un regalo o descuento especial por su cumpleaños.
        Tono: festivo, cálido, cercano. Solo el texto del mensaje.`,
      vip: `Genera un mensaje de WhatsApp exclusivo para un cliente VIP de ${bizName}.
        Cliente: ${customer.full_name}. Visitas: ${orderCount}. Total gastado: $${totalSpent.toLocaleString('es-CO')} COP.
        El mensaje debe: reconocer su lealtad, hacerlo sentir especial y exclusivo, ofrecer un beneficio por ser cliente VIP.
        Tono: exclusivo, agradecido, premium. Solo el texto del mensaje.`,
      risk: `Genera un mensaje de WhatsApp para recuperar a un cliente que está empezando a alejarse de ${bizName}.
        Cliente: ${customer.full_name}. Lleva ${daysSince} días sin visitar. Total visitas: ${orderCount}.
        El mensaje debe: ser sutil (no mencionar que "detectamos que no has venido"), simplemente invitar de vuelta con un mensaje fresco y una oferta atractiva.
        Tono: amigable, motivador. Solo el texto del mensaje.`,
    };

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: PROMPTS[type] }],
    });

    const message = response.content[0]?.text?.trim() || '';
    logger.info(`[retention] Mensaje generado tipo=${type} cliente=${customer.full_name}`);

    res.json({
      message,
      customer: { id: customer.id, full_name: customer.full_name, phone: customer.phone },
      stats: { order_count: orderCount, total_spent: totalSpent, days_since: daysSince },
    });

  } catch (err) {
    logger.error('[retention] Error generando mensaje:', err.message);
    res.status(500).json({ error: 'Error generando mensaje' });
  }
});

export default router;
