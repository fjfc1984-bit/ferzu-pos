// =============================================================================
// FERZU POS — Reports Routes  (/api/reports)
// =============================================================================
import express from 'express';
import { Resend } from 'resend';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, assertBranchOwnership } from '../middleware/auth.js';
import logger from '../config/logger.js';

const router = express.Router();
router.use(requireAuth);

const getResend = () => new Resend(process.env.RESEND_API_KEY || 'placeholder');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n ?? 0);
}

function toLocalDateCO(isoStr) {
  // Colombia = UTC-5. Convierte un timestamp UTC a fecha local CO para agrupar por hora.
  const d = new Date(isoStr);
  const offset = -5 * 60; // minutos
  const local = new Date(d.getTime() + (offset - d.getTimezoneOffset()) * 60_000);
  return local;
}

const PAYMENT_LABELS = {
  cash:           'Efectivo',
  card_debit:     'Tarjeta Débito',
  card_credit:    'Tarjeta Crédito',
  nequi:          'Nequi',
  daviplata:      'Daviplata',
  transfer:       'Transferencia',
  loyalty_points: 'Puntos',
  mixed:          'Pago Mixto',
  other:          'Otro',
};

function buildDailyReport(orders, date) {
  if (!orders || orders.length === 0) {
    return {
      date,
      total_orders:   0,
      total_revenue:  0,
      total_tax:      0,
      total_discount: 0,
      avg_ticket:     0,
      by_hour:        Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 })),
      by_payment:     [],
      top_products:   [],
    };
  }

  let totalRevenue  = 0;
  let totalTax      = 0;
  let totalDiscount = 0;
  let totalTips     = 0;
  let totalCourtesy = 0;   // F10

  const hourMap    = {};
  const paymentMap = {};
  const productMap = {};

  for (const order of orders) {
    const rev  = Number(order.total)           || 0;
    const tax  = Number(order.tax_total)       || 0;
    const disc = Number(order.discount_amount) || 0;
    const tip  = Number(order.tip_amount)      || 0;
    const cou  = Number(order.courtesy_amount) || 0;  // F10

    totalRevenue  += rev;
    totalTax      += tax;
    totalDiscount += disc;
    totalTips     += tip;
    totalCourtesy += cou;  // F10

    // Agrupar por hora (UTC-5 Colombia)
    const localD = toLocalDateCO(order.created_at);
    const hour   = localD.getHours();
    if (!hourMap[hour]) hourMap[hour] = { orders: 0, revenue: 0 };
    hourMap[hour].orders  += 1;
    hourMap[hour].revenue += rev;

    // Agrupar por método de pago (desde payments[] join o metadata)
    const pm = order.payments?.[0]?.payment_method || order.metadata?.payment_method || 'other';
    if (!paymentMap[pm]) paymentMap[pm] = { method: pm, label: PAYMENT_LABELS[pm] || pm, orders: 0, revenue: 0 };
    paymentMap[pm].orders  += 1;
    paymentMap[pm].revenue += rev;

    // Agrupar productos
    for (const item of order.order_items || []) {
      const key  = item.product_id || item.product_name;
      const name = item.product_name || 'Producto sin nombre';
      const qty  = Number(item.quantity)    || 0;
      const tot  = Number(item.subtotal) || 0;
      if (!productMap[key]) productMap[key] = { name, qty: 0, revenue: 0 };
      productMap[key].qty     += qty;
      productMap[key].revenue += tot;
    }
  }

  const by_hour = Array.from({ length: 24 }, (_, h) => ({
    hour:    h,
    orders:  hourMap[h]?.orders  ?? 0,
    revenue: hourMap[h]?.revenue ?? 0,
  }));

  const by_payment = Object.values(paymentMap)
    .sort((a, b) => b.revenue - a.revenue);

  const top_products = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((p, i) => ({ rank: i + 1, ...p }));

  return {
    date,
    total_orders:   orders.length,
    total_revenue:  totalRevenue,
    total_tax:      totalTax,
    total_discount: totalDiscount,
    total_tips:     totalTips,
    total_courtesy: totalCourtesy,  // F10
    avg_ticket:     Math.round(totalRevenue / orders.length),
    by_hour,
    by_payment,
    top_products,
  };
}

// =============================================================================
// GET /api/reports/owner-summary
// Resumen ejecutivo MULTI-SUCURSAL para el dueño — optimizado para móvil.
// No requiere branch_id: agrega datos de TODAS las sucursales de la org.
// Solo accesible para role owner o admin.
// =============================================================================
router.get('/owner-summary', async (req, res) => {
  try {
    const { requireRole } = await import('../middleware/auth.js');

    // Solo owners y admins
    if (!['owner', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Solo el dueño o administrador puede ver este resumen' });
    }

    const orgId = req.organizationId;
    const today = new Date();
    // Ventana UTC para Colombia (UTC-5): día actual desde las 05:00Z
    const todayStr  = today.toISOString().split('T')[0];
    const dayStart  = `${todayStr}T05:00:00.000Z`;
    const tomorrow  = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayEnd    = `${tomorrow.toISOString().split('T')[0]}T05:00:00.000Z`;

    // Traer todas las sucursales de la org
    const { data: branches, error: branchErr } = await supabaseAdmin
      .from('branches')
      .select('id, name, niche')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (branchErr) throw branchErr;
    const branchIds = (branches || []).map(b => b.id);
    const branchMap = Object.fromEntries((branches || []).map(b => [b.id, b]));

    if (branchIds.length === 0) {
      return res.json({ today: { revenue: 0, orders: 0, avg_ticket: 0 }, branches: [], alerts: [], stock_alerts: [], cash_sessions: [] });
    }

    // Ejecutar todas las queries en paralelo
    const [ordersRes, alertsRes, stockRes, cashRes] = await Promise.all([
      // Órdenes completadas del día (todas las sucursales)
      supabaseAdmin
        .from('orders')
        .select('id, total, branch_id, created_at')
        .in('branch_id', branchIds)
        .eq('status', 'paid')
        .gte('created_at', dayStart)
        .lt('created_at', dayEnd),

      // Alertas activas no resueltas
      supabaseAdmin
        .from('system_alerts')
        .select('id, alert_type, severity, description, branch_id, created_at, metadata')
        .eq('organization_id', orgId)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(10),

      // Productos bajo stock mínimo
      supabaseAdmin
        .from('inventory')
        .select('quantity, branch_id, products!inner(name, min_stock, track_inventory)')
        .in('branch_id', branchIds)
        .eq('products.track_inventory', true)
        .gt('products.min_stock', 0),

      // Sesiones de caja abiertas hoy
      supabaseAdmin
        .from('cash_sessions')
        .select('id, branch_id, opening_cash, status, opened_at, closed_at')
        .in('branch_id', branchIds)
        .eq('status', 'open'),
    ]);

    const orders = ordersRes.data || [];

    // Agregar métricas del día por sucursal
    const byBranch = {};
    for (const o of orders) {
      if (!byBranch[o.branch_id]) byBranch[o.branch_id] = { revenue: 0, orders: 0 };
      byBranch[o.branch_id].revenue += Number(o.total) || 0;
      byBranch[o.branch_id].orders  += 1;
    }

    const totalRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const totalOrders  = orders.length;

    // Productos bajo stock mínimo
    const lowStock = (stockRes.data || [])
      .filter(r => (r.quantity ?? 0) <= (r.products?.min_stock ?? 0))
      .slice(0, 8)
      .map(r => ({
        name:      r.products?.name,
        quantity:  r.quantity ?? 0,
        min_stock: r.products?.min_stock,
        branch:    branchMap[r.branch_id]?.name || r.branch_id,
        critical:  (r.quantity ?? 0) <= 0,
      }));

    // Resumen por sucursal
    const branchSummary = (branches || []).map(b => ({
      id:      b.id,
      name:    b.name,
      revenue: byBranch[b.id]?.revenue || 0,
      orders:  byBranch[b.id]?.orders  || 0,
    })).sort((a, b) => b.revenue - a.revenue);

    res.json({
      today: {
        revenue:    totalRevenue,
        orders:     totalOrders,
        avg_ticket: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
        date:       todayStr,
      },
      branches:      branchSummary,
      alerts:        alertsRes.data || [],
      stock_alerts:  lowStock,
      cash_sessions: (cashRes.data || []).map(s => ({
        id:       s.id,
        branch:   branchMap[s.branch_id]?.name || s.branch_id,
        status:   s.status,
        opened_at: s.opened_at,
      })),
    });
  } catch (err) {
    logger.error('[REPORTS] owner-summary error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// GET /api/reports/dashboard?branch_id=&date=YYYY-MM-DD
// =============================================================================
router.get('/dashboard', async (req, res) => {
  try {
    const { branch_id, date = new Date().toISOString().split('T')[0] } = req.query;
    if (!branch_id) return res.status(400).json({ error: 'branch_id requerido' });
    await assertBranchOwnership(branch_id, req.organizationId);

    const [salesResult, topProductsResult, alertsResult] = await Promise.all([
      supabaseAdmin.from('v_daily_sales').select('*')
        .eq('branch_id', branch_id).eq('sale_date', date).maybeSingle(),
      supabaseAdmin.from('v_product_profitability').select('*')
        .eq('organization_id', req.organizationId)
        .order('total_revenue', { ascending: false }).limit(5),
      supabaseAdmin.from('system_alerts').select('*')
        .eq('organization_id', req.organizationId)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false }).limit(10),
    ]);

    res.json({
      today_sales:  salesResult.data || { total_orders: 0, total_revenue: 0, total_tax: 0, sale_date: date },
      top_products: topProductsResult.data || [],
      alerts:       alertsResult.data || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// GET /api/reports/daily?date=YYYY-MM-DD&branch_id=
// Reporte detallado del día: por hora, por método de pago, top productos
// =============================================================================
router.get('/daily', async (req, res) => {
  try {
    const {
      date      = new Date().toISOString().split('T')[0],
      branch_id,
    } = req.query;

    // Validar fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date debe tener formato YYYY-MM-DD' });
    }

    if (branch_id) {
      await assertBranchOwnership(branch_id, req.organizationId);
    }

    // Ventana UTC que cubre todo el día en Colombia (UTC-5 = +5h offset)
    // Para date='2026-08-02': desde 2026-08-02T05:00:00Z hasta 2026-08-03T05:00:00Z
    const dayStart = `${date}T05:00:00.000Z`;
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];
    const dayEnd   = `${nextDateStr}T05:00:00.000Z`;

    if (!branch_id) return res.status(400).json({ error: 'branch_id requerido' });
    await assertBranchOwnership(branch_id, req.organizationId);

    let query = supabaseAdmin
      .from('orders')
      .select(`
        id, total, subtotal, tax_total, discount_amount, tip_amount,
        courtesy_amount, is_courtesy, metadata, status, created_at,
        payments(payment_method, amount),
        order_items(product_id, product_name, quantity, unit_price, subtotal)
      `)
      .eq('branch_id', branch_id)
      .eq('status', 'completed')
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd)
      .order('created_at', { ascending: true });

    const { data: orders, error } = await query;
    if (error) throw error;

    const report = buildDailyReport(orders, date);
    logger.info('[REPORTS] daily', { orgId: req.organizationId, date, orders: report.total_orders });
    res.json(report);
  } catch (err) {
    logger.error('[REPORTS] daily error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// =============================================================================
// GET /api/reports/weekly?branch_id=&week_start=YYYY-MM-DD
// Reporte semanal: 7 días de la semana actual + comparativa semana anterior.
// week_start: lunes de la semana a consultar (default: lunes de esta semana).
// Responde con:
//   { current: DailyReport[], prev: DailyReport[], comparison: { revenue, orders, avg_ticket, delta_pct } }
// =============================================================================
router.get('/weekly', async (req, res) => {
  try {
    const { branch_id, week_start } = req.query;

    // Calcular lunes de la semana actual (Colombia UTC-5)
    const now = new Date();
    const todayCO = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const dayOfWeek = todayCO.getUTCDay(); // 0=Sun … 6=Sat
    const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    let monday;
    if (week_start && /^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
      monday = new Date(week_start + 'T00:00:00.000Z');
    } else {
      monday = new Date(todayCO);
      monday.setUTCDate(todayCO.getUTCDate() - daysFromMon);
      monday.setUTCHours(0, 0, 0, 0);
    }

    // Helper: fecha YYYY-MM-DD desde un Date UTC
    const toDateStr = (d) => d.toISOString().split('T')[0];

    // Generar los 7 días de esta semana y los 7 de la semana anterior
    const currentDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      return toDateStr(d);
    });
    const prevDates = currentDates.map(dateStr => {
      const d = new Date(dateStr + 'T00:00:00.000Z');
      d.setUTCDate(d.getUTCDate() - 7);
      return toDateStr(d);
    });

    // Cargar órdenes de ambas semanas en una sola query (14 días)
    const rangeStart = prevDates[0] + 'T05:00:00.000Z';      // lunes semana anterior CO
    const rangeEnd   = currentDates[6] + 'T05:00:00.000Z';   // lunes siguiente semana CO
    const nextDayEnd = new Date(currentDates[6] + 'T05:00:00.000Z');
    nextDayEnd.setUTCDate(nextDayEnd.getUTCDate() + 1);

    if (!branch_id) return res.status(400).json({ error: 'branch_id requerido' });
    await assertBranchOwnership(branch_id, req.organizationId);

    let query = supabaseAdmin
      .from('orders')
      .select(`
        id, total, subtotal, tax_total, discount_amount, tip_amount,
        courtesy_amount, is_courtesy, metadata, status, created_at,
        payments(payment_method, amount),
        order_items(product_id, product_name, quantity, unit_price, subtotal)
      `)
      .eq('branch_id', branch_id)
      .eq('status', 'completed')
      .gte('created_at', rangeStart)
      .lt('created_at', nextDayEnd.toISOString())
      .order('created_at', { ascending: true });

    const { data: allOrders, error } = await query;
    if (error) throw error;

    // Segmentar órdenes por fecha colombiana
    const ordersByDate = {};
    for (const order of allOrders || []) {
      const localD  = toLocalDateCO(order.created_at);
      const dateKey = localD.toISOString().split('T')[0];
      if (!ordersByDate[dateKey]) ordersByDate[dateKey] = [];
      ordersByDate[dateKey].push(order);
    }

    // Construir reporte diario para cada día de ambas semanas
    const currentReports = currentDates.map(d => buildDailyReport(ordersByDate[d] || [], d));
    const prevReports    = prevDates.map(d    => buildDailyReport(ordersByDate[d] || [], d));

    // Totales de semana para comparación
    const sumWeek = (reports) => ({
      revenue:   reports.reduce((s, r) => s + r.total_revenue, 0),
      orders:    reports.reduce((s, r) => s + r.total_orders,  0),
      avg_ticket: reports.reduce((s, r) => s + r.total_orders, 0)
        ? Math.round(reports.reduce((s, r) => s + r.total_revenue, 0) /
                     reports.reduce((s, r) => s + r.total_orders, 0))
        : 0,
    });

    const curTotals  = sumWeek(currentReports);
    const prevTotals = sumWeek(prevReports);

    const pct = (cur, prev) =>
      prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);

    res.json({
      week_start:      toDateStr(monday),
      current:         currentReports,
      prev:            prevReports,
      current_dates:   currentDates,
      prev_dates:      prevDates,
      comparison: {
        revenue:    { current: curTotals.revenue,    prev: prevTotals.revenue,    delta_pct: pct(curTotals.revenue,    prevTotals.revenue)    },
        orders:     { current: curTotals.orders,     prev: prevTotals.orders,     delta_pct: pct(curTotals.orders,     prevTotals.orders)     },
        avg_ticket: { current: curTotals.avg_ticket, prev: prevTotals.avg_ticket, delta_pct: pct(curTotals.avg_ticket, prevTotals.avg_ticket) },
      },
    });
  } catch (err) {
    logger.error('[REPORTS] weekly error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// POST /api/reports/daily/send-email
// Envía el reporte del día por email al owner/admin de la org
// Body: { date: 'YYYY-MM-DD', branch_id?: string }
// =============================================================================
router.post('/daily/send-email', async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0], branch_id } = req.body;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date debe tener formato YYYY-MM-DD' });
    }

    if (branch_id) {
      await assertBranchOwnership(branch_id, req.organizationId);
    }

    // Obtener datos de la org (email destino + nombre)
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('business_name, email')
      .eq('id', req.organizationId)
      .single();

    const recipientEmail = org?.email;
    if (!recipientEmail) {
      return res.status(422).json({ error: 'La organización no tiene email configurado' });
    }

    // Reusar el endpoint /daily internamente para obtener el reporte
    const dayStart = `${date}T05:00:00.000Z`;
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dayEnd = `${nextDate.toISOString().split('T')[0]}T05:00:00.000Z`;

    if (branch_id) await assertBranchOwnership(branch_id, req.organizationId);

    let query = supabaseAdmin
      .from('orders')
      .select('id, total, tax_total, discount_amount, metadata, created_at, payments(payment_method, amount), order_items(product_name, quantity, subtotal)')
      .eq('status', 'completed')
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd);

    if (branch_id) query = query.eq('branch_id', branch_id);

    const { data: orders } = await query;
    const report = buildDailyReport(orders || [], date);

    // Formatear fecha en español
    const dateObj = new Date(`${date}T12:00:00`);
    const fechaFormateada = dateObj.toLocaleDateString('es-CO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // Comparar con ayer para la tendencia
    const comparisonLabel = report.total_orders > 0
      ? `${report.total_orders} ${report.total_orders === 1 ? 'venta registrada' : 'ventas registradas'}`
      : 'Sin ventas este día';

    const topProductsRows = report.top_products.slice(0, 5).map((p, i) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 12px; color:#6b7280; font-size:13px;">${i + 1}</td>
        <td style="padding:10px 12px; font-size:13px; color:#111827; font-weight:500;">${p.name}</td>
        <td style="padding:10px 12px; font-size:13px; color:#6b7280; text-align:right;">${p.qty}</td>
        <td style="padding:10px 12px; font-size:13px; color:#059669; font-weight:600; text-align:right;">${formatCOP(p.revenue)}</td>
      </tr>
    `).join('');

    const paymentRows = report.by_payment.slice(0, 4).map(pm => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f3f4f6;">
        <span style="color:#374151; font-size:13px;">${pm.label}</span>
        <span style="color:#059669; font-weight:600; font-size:13px;">${formatCOP(pm.revenue)}</span>
      </div>
    `).join('');

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px; margin:0 auto; padding:20px 16px;">

    <!-- Header -->
    <div style="background:#059669; border-radius:16px 16px 0 0; padding:32px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
        <div style="background:rgba(255,255,255,0.2); border-radius:12px; width:44px; height:44px;
                    display:flex; align-items:center; justify-content:center; font-size:22px;">📊</div>
        <div>
          <p style="color:#d1fae5; font-size:12px; margin:0; text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">FERZU POS</p>
          <h1 style="color:white; font-size:22px; margin:4px 0 0; font-weight:700;">Reporte Diario de Ventas</h1>
        </div>
      </div>
      <p style="color:#a7f3d0; font-size:14px; margin:12px 0 0; text-transform:capitalize;">${fechaFormateada}</p>
      <p style="color:#6ee7b7; font-size:13px; margin:4px 0 0;">${org.business_name} · ${comparisonLabel}</p>
    </div>

    <!-- KPIs -->
    <div style="background:white; padding:24px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">
        ${[
          ['💰 Ventas totales', formatCOP(report.total_revenue), '#059669'],
          ['🧾 N° Tickets',     report.total_orders,             '#2563eb'],
          ['📈 Ticket promedio', formatCOP(report.avg_ticket),   '#7c3aed'],
          ['🏦 IVA recaudado',  formatCOP(report.total_tax),     '#d97706'],
          ['🔖 Descuentos',     formatCOP(report.total_discount),'#dc2626'],
          ['⏰ Hora pico',       (() => {
            const peak = report.by_hour.reduce((a, b) => b.revenue > a.revenue ? b : a, { hour: 0, revenue: 0 });
            return peak.revenue > 0 ? `${String(peak.hour).padStart(2,'0')}:00` : 'N/A';
          })(), '#0891b2'],
        ].map(([label, val, color]) => `
          <div style="background:#f9fafb; border-radius:10px; padding:14px; border:1px solid #e5e7eb;">
            <p style="font-size:11px; color:#9ca3af; margin:0 0 6px; font-weight:600;">${label}</p>
            <p style="font-size:20px; font-weight:700; color:${color}; margin:0;">${val}</p>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Top productos -->
    ${topProductsRows ? `
    <div style="background:white; padding:24px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb; margin-top:1px;">
      <h3 style="margin:0 0 16px; font-size:15px; color:#111827; font-weight:700;">🏆 Top productos del día</h3>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px; text-align:left; font-size:11px; color:#9ca3af; font-weight:600;">#</th>
            <th style="padding:8px 12px; text-align:left; font-size:11px; color:#9ca3af; font-weight:600;">PRODUCTO</th>
            <th style="padding:8px 12px; text-align:right; font-size:11px; color:#9ca3af; font-weight:600;">CANT.</th>
            <th style="padding:8px 12px; text-align:right; font-size:11px; color:#9ca3af; font-weight:600;">INGRESOS</th>
          </tr>
        </thead>
        <tbody>${topProductsRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Métodos de pago -->
    ${paymentRows ? `
    <div style="background:white; padding:24px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb; margin-top:1px;">
      <h3 style="margin:0 0 12px; font-size:15px; color:#111827; font-weight:700;">💳 Métodos de pago</h3>
      ${paymentRows}
    </div>` : ''}

    <!-- CTA -->
    <div style="background:white; border-radius:0 0 16px 16px; padding:24px; border:1px solid #e5e7eb; text-align:center;">
      <a href="https://ferzu-pos.vercel.app/reporte?date=${date}"
         style="display:inline-block; background:#059669; color:white; padding:14px 32px;
                border-radius:10px; text-decoration:none; font-weight:700; font-size:14px;">
        Ver reporte completo en FERZU POS →
      </a>
      <p style="font-size:11px; color:#9ca3af; margin:16px 0 0;">
        Este reporte fue generado automáticamente por FERZU POS.
        Para configurar el horario de envío, ve a Configuración → Reportes.
      </p>
    </div>

  </div>
</body>
</html>`;

    await getResend().emails.send({
      from:    process.env.RESEND_FROM_EMAIL || 'FERZU POS <reportes@resend.dev>',
      to:      recipientEmail,
      subject: `📊 Reporte del ${fechaFormateada} — ${org.business_name}`,
      html,
    });

    logger.info('[REPORTS] email enviado', { orgId: req.organizationId, date, email: recipientEmail });
    res.json({ sent: true, to: recipientEmail, date });
  } catch (err) {
    logger.error('[REPORTS] send-email error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// GET /api/reports/period?from=YYYY-MM-DD&to=YYYY-MM-DD&branch_id=
// Agrega ventas de cualquier rango en UNA sola query al backend.
// Retorna: { total_revenue, total_orders, avg_ticket, by_hour[], by_payment[], top_products[], chart[] }
// "chart" = un entry por día en el rango con { date, label, revenue, orders }
// =============================================================================
router.get('/period', async (req, res) => {
  try {
    const { from, to, branch_id } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from y to son requeridos (YYYY-MM-DD)' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'Formato de fecha inválido. Usar YYYY-MM-DD' });
    }

    // Limitar rango máximo a 90 días para evitar queries masivas
    const diffMs   = new Date(to) - new Date(from);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 0)   return res.status(400).json({ error: 'from debe ser anterior a to' });
    if (diffDays > 90)  return res.status(400).json({ error: 'El rango máximo es 90 días' });

    if (branch_id) await assertBranchOwnership(branch_id, req.organizationId);

    // Ventana UTC ajustada a Colombia (UTC-5): from T05:00Z → (to+1) T05:00Z
    const rangeStart = `${from}T05:00:00.000Z`;
    const toDate = new Date(to + 'T12:00:00Z');
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    const rangeEnd = toDate.toISOString().split('T')[0] + 'T05:00:00.000Z';

    if (!branch_id) return res.status(400).json({ error: 'branch_id requerido' });
    await assertBranchOwnership(branch_id, req.organizationId);

    let query = supabaseAdmin
      .from('orders')
      .select(`
        id, total, subtotal, tax_total, discount_amount, tip_amount,
        metadata, status, created_at,
        payments(payment_method, amount),
        order_items(product_id, product_name, quantity, unit_price, subtotal)
      `)
      .eq('branch_id', branch_id)
      .eq('status', 'completed')
      .gte('created_at', rangeStart)
      .lt('created_at', rangeEnd)
      .order('created_at', { ascending: true });

    const { data: orders, error } = await query;
    if (error) throw error;

    // Acumuladores
    let totalRevenue = 0, totalOrders = 0, totalDiscount = 0, totalTax = 0;
    const hourMap    = {};
    const paymentMap = {};
    const productMap = {};
    const dayMap     = {};

    for (const o of orders || []) {
      const rev  = Number(o.total) || 0;
      totalRevenue  += rev;
      totalOrders++;
      totalDiscount += Number(o.discount_amount) || 0;
      totalTax      += Number(o.tax_total) || 0;

      // Hora Colombia
      const local  = toLocalDateCO(o.created_at);
      const hour   = local.getHours();
      const dayKey = local.toISOString().split('T')[0];

      if (!hourMap[hour]) hourMap[hour] = { orders: 0, revenue: 0 };
      hourMap[hour].orders++;
      hourMap[hour].revenue += rev;

      // Por día (para chart)
      if (!dayMap[dayKey]) dayMap[dayKey] = { orders: 0, revenue: 0 };
      dayMap[dayKey].orders++;
      dayMap[dayKey].revenue += rev;

      // Por método de pago
      const pm = o.payments?.[0]?.payment_method || o.metadata?.payment_method || 'other';
      if (!paymentMap[pm]) paymentMap[pm] = { method: pm, label: PAYMENT_LABELS[pm] || pm, orders: 0, revenue: 0 };
      paymentMap[pm].orders++;
      paymentMap[pm].revenue += rev;

      // Por producto
      for (const item of o.order_items || []) {
        const key  = item.product_id || item.product_name;
        const name = item.product_name || 'Sin nombre';
        if (!productMap[key]) productMap[key] = { name, qty: 0, revenue: 0 };
        productMap[key].qty     += Number(item.quantity) || 0;
        productMap[key].revenue += Number(item.subtotal) || 0;
      }
    }

    // Construir chart: un entry por día en el rango
    const chart = [];
    const cursor = new Date(from + 'T12:00:00Z');
    const endD   = new Date(to + 'T12:00:00Z');
    while (cursor <= endD) {
      const dayKey = cursor.toISOString().split('T')[0];
      const day    = dayMap[dayKey] || { orders: 0, revenue: 0 };
      chart.push({
        date:    dayKey,
        label:   String(cursor.getUTCDate()),
        revenue: day.revenue,
        orders:  day.orders,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const by_hour = Array.from({ length: 24 }, (_, h) => ({
      hour: h, orders: hourMap[h]?.orders || 0, revenue: hourMap[h]?.revenue || 0,
    }));
    const by_payment  = Object.values(paymentMap).sort((a, b) => b.revenue - a.revenue);
    const top_products = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue).slice(0, 10)
      .map((p, i) => ({ rank: i + 1, ...p }));

    res.json({
      from, to,
      total_revenue:  totalRevenue,
      total_orders:   totalOrders,
      total_discount: totalDiscount,
      total_tax:      totalTax,
      avg_ticket:     totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      by_hour,
      by_payment,
      top_products,
      chart,
    });
  } catch (err) {
    logger.error('[reports] period error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// GET /api/reports/monthly?year=2026&branch_id=
// 12 meses del año solicitado + comparativa mismo mes año anterior
// =============================================================================
router.get('/monthly', async (req, res) => {
  try {
    const year     = parseInt(req.query.year || new Date().getFullYear(), 10);
    const branch_id = req.query.branch_id || null;

    if (branch_id) await assertBranchOwnership(branch_id, req.organizationId);

    // Rango: 1 ene año-1 → 31 dic año (UTC+5 offset Colombia)
    const rangeStart = `${year - 1}-01-01T05:00:00.000Z`;
    const rangeEnd   = `${year + 1}-01-01T05:00:00.000Z`;

    if (!branch_id) return res.status(400).json({ error: 'branch_id requerido' });
    await assertBranchOwnership(branch_id, req.organizationId);

    let query = supabaseAdmin
      .from('orders')
      .select('total, created_at')
      .eq('branch_id', branch_id)
      .eq('status', 'completed')
      .gte('created_at', rangeStart)
      .lt('created_at', rangeEnd)
      .order('created_at', { ascending: true });

    const { data: orders, error } = await query;
    if (error) throw error;

    // Agrupar por año-mes en hora Colombia (UTC-5)
    const monthMap = {};
    for (const o of orders || []) {
      const local = toLocalDateCO(o.created_at);
      const y = local.getFullYear();
      const m = local.getMonth() + 1; // 1-12
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { year: y, month: m, orders: 0, revenue: 0 };
      monthMap[key].orders++;
      monthMap[key].revenue += Number(o.total) || 0;
    }

    const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    // Construir array de 12 meses para el año solicitado con comparativa
    const current = Array.from({ length: 12 }, (_, i) => {
      const m   = i + 1;
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const prevKey = `${year - 1}-${String(m).padStart(2, '0')}`;
      const cur  = monthMap[key]  || { orders: 0, revenue: 0 };
      const prev = monthMap[prevKey] || { orders: 0, revenue: 0 };
      const delta = prev.revenue > 0
        ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 100)
        : null;
      return {
        month:        m,
        month_name:   MONTH_NAMES[i],
        year,
        orders:       cur.orders,
        revenue:      cur.revenue,
        avg_ticket:   cur.orders > 0 ? Math.round(cur.revenue / cur.orders) : 0,
        prev_revenue: prev.revenue,
        prev_orders:  prev.orders,
        delta_pct:    delta,
      };
    });

    // Totales del año
    const totals = current.reduce((acc, m) => ({
      revenue:    acc.revenue + m.revenue,
      orders:     acc.orders  + m.orders,
    }), { revenue: 0, orders: 0 });

    const prevTotals = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const key = `${year - 1}-${String(m).padStart(2, '0')}`;
      return monthMap[key] || { orders: 0, revenue: 0 };
    }).reduce((acc, m) => ({ revenue: acc.revenue + m.revenue, orders: acc.orders + m.orders }), { revenue: 0, orders: 0 });

    const yearDelta = prevTotals.revenue > 0
      ? Math.round(((totals.revenue - prevTotals.revenue) / prevTotals.revenue) * 100)
      : null;

    logger.info(`[reports] monthly year=${year} org=${req.organizationId} revenue=${totals.revenue}`);
    res.json({
      year,
      months:      current,
      totals:      { ...totals, avg_ticket: totals.orders > 0 ? Math.round(totals.revenue / totals.orders) : 0 },
      prev_totals: { ...prevTotals, year: year - 1 },
      year_delta_pct: yearDelta,
    });
  } catch (err) {
    logger.error('[reports] monthly error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// GET /api/reports/branch-comparison?period=week|month|year&date=YYYY-MM-DD
// Ranking de desempeño por sucursal para el período solicitado
// =============================================================================
router.get('/branch-comparison', async (req, res) => {
  try {
    const { period = 'month', date = new Date().toISOString().split('T')[0] } = req.query;

    // Calcular rango según período
    const ref = new Date(date + 'T12:00:00.000Z');
    let rangeStart, rangeEnd;

    if (period === 'week') {
      // Semana actual (lunes a domingo)
      const day = ref.getUTCDay();
      const daysFromMon = day === 0 ? 6 : day - 1;
      const monday = new Date(ref);
      monday.setUTCDate(ref.getUTCDate() - daysFromMon);
      rangeStart = monday.toISOString().split('T')[0] + 'T05:00:00.000Z';
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 7);
      rangeEnd = sunday.toISOString().split('T')[0] + 'T05:00:00.000Z';
    } else if (period === 'month') {
      const y = ref.getUTCFullYear();
      const m = ref.getUTCMonth() + 1;
      rangeStart = `${y}-${String(m).padStart(2,'0')}-01T05:00:00.000Z`;
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      rangeEnd = `${nextY}-${String(nextM).padStart(2,'0')}-01T05:00:00.000Z`;
    } else {
      // year
      const y = ref.getUTCFullYear();
      rangeStart = `${y}-01-01T05:00:00.000Z`;
      rangeEnd   = `${y + 1}-01-01T05:00:00.000Z`;
    }

    // Traer órdenes y sucursales
    const [ordersRes, branchesRes] = await Promise.all([
      supabaseAdmin
        .from('orders')
        .select('branch_id, total, created_at')
        .eq('status', 'paid')
        .gte('created_at', rangeStart)
        .lt('created_at', rangeEnd),
      supabaseAdmin
        .from('branches')
        .select('id, name')
        .eq('organization_id', req.organizationId),
    ]);

    if (ordersRes.error) throw ordersRes.error;

    const branchMap = {};
    for (const b of branchesRes.data || []) {
      branchMap[b.id] = { id: b.id, name: b.name, orders: 0, revenue: 0 };
    }

    for (const o of ordersRes.data || []) {
      if (!o.branch_id) continue;
      if (!branchMap[o.branch_id]) branchMap[o.branch_id] = { id: o.branch_id, name: 'Sin nombre', orders: 0, revenue: 0 };
      branchMap[o.branch_id].orders++;
      branchMap[o.branch_id].revenue += Number(o.total) || 0;
    }

    const branches = Object.values(branchMap)
      .map(b => ({
        ...b,
        avg_ticket: b.orders > 0 ? Math.round(b.revenue / b.orders) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .map((b, i) => ({ ...b, rank: i + 1 }));

    const totalRevenue = branches.reduce((s, b) => s + b.revenue, 0);
    const result = branches.map(b => ({
      ...b,
      share_pct: totalRevenue > 0 ? Math.round((b.revenue / totalRevenue) * 100) : 0,
    }));

    res.json({ period, branches: result, total_revenue: totalRevenue });
  } catch (err) {
    logger.error('[reports] branch-comparison error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;

