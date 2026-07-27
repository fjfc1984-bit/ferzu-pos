// =============================================================================
// FERZU POS — BACKEND API REST (NODE.JS + EXPRESS + SUPABASE)
// Versión: 1.0.0
// Arquitectura: Monolito modular → microservicios cuando escale
// Deploy: Railway / Render / Fly.io (o Supabase Edge Functions para funciones simples)
// =============================================================================
// REGLA DE ORO: TODO cálculo matemático vive en este archivo.
// La IA extrae, clasifica y propone. El backend valida, calcula y persiste.
// =============================================================================

// ── Dependencias ──────────────────────────────────────────────────────────────
// npm install express @supabase/supabase-js @anthropic-ai/sdk
//             express-rate-limit helmet cors express-validator
//             winston dotenv uuid

import express              from 'express';
import cors                 from 'cors';
import helmet               from 'helmet';
import rateLimit            from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { createClient }     from '@supabase/supabase-js';
import { v4 as uuidv4 }     from 'uuid';
import winston              from 'winston';
import dotenv               from 'dotenv';
import { Resend }           from 'resend';
import cron                 from 'node-cron';
import { runFerzuAgent }    from './ferzu_claude_tools.js';

dotenv.config();

// =============================================================================
// CONFIGURACIÓN GLOBAL
// =============================================================================

const app  = express();
const PORT = process.env.PORT || 3001;

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Supabase (cliente con service_role para el backend — NUNCA exponer al frontend)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,  // service_role bypasa RLS cuando es necesario
  { auth: { persistSession: false } }
);

// =============================================================================
// MIDDLEWARES GLOBALES
// =============================================================================

app.use(helmet());
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Permitir llamadas sin origen (curl, Postman en dev) solo en local
    if (!origin && process.env.NODE_ENV !== 'production') return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origen no permitido → ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));  // Reducido: las imágenes de facturas deben subirse a Supabase Storage, no inline

// Rate limiting general
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutos
  max: 300,
  message: { error: 'Demasiadas solicitudes. Intenta en 15 minutos.' }
}));

// Rate limiting para endpoints de IA (más restrictivo — costo por token)
const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,        // 1 minuto
  max: 10,
  message: { error: 'Límite de consultas de IA alcanzado. Espera un momento.' }
});


// =============================================================================
// MIDDLEWARE DE AUTENTICACIÓN
// Verifica el JWT de Supabase e inyecta el contexto del usuario
// =============================================================================

async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requerido' });

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token inválido o expirado' });

    // Cargar datos del usuario desde nuestra tabla
    const { data: userData, error: userErr } = await supabaseAdmin
      .from('users')
      .select('*, user_branches(branch_id, is_default)')
      .eq('id', user.id)
      .single();

    if (userErr || !userData) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (!userData.is_active)   return res.status(403).json({ error: 'Usuario inactivo' });

    req.user = userData;
    req.organizationId = userData.organization_id;  // ← desde nuestra tabla, no de JWT

    // Supabase cliente con el JWT del usuario (respeta RLS)
    req.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    next();
  } catch (err) {
    logger.error('Auth error', { err });
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

// Middleware de permisos por rol
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requiere rol: ${roles.join(' o ')}` });
    }
    next();
  };
}

// Validador de errores de express-validator
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// Log de auditoría
async function logAudit(organizationId, userId, action, tableName, recordId, oldValues, newValues) {
  await supabaseAdmin.from('audit_log').insert({
    organization_id: organizationId,
    user_id: userId,
    action,
    table_name: tableName,
    record_id: recordId,
    old_values: oldValues,
    new_values: newValues,
  }).throwOnError();
}


// =============================================================================
// ─── RUTAS: AUTENTICACIÓN ─────────────────────────────────────────────────────
// =============================================================================

const authRouter = express.Router();

// POST /auth/login
authRouter.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  validate,
], async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Credenciales incorrectas' });

    // Actualizar last_login_at
    await supabaseAdmin.from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id);

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.app_metadata?.role,
      }
    });
  } catch (err) {
    logger.error('Login error', { err });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /auth/pin — Login rápido por PIN en caja
authRouter.post('/pin', [
  body('pin').isLength({ min: 4, max: 6 }).isNumeric(),
  body('branch_id').isUUID(),
  validate,
], async (req, res) => {
  try {
    const { pin, branch_id } = req.body;

    // Paso 1: obtener IDs de usuarios asignados a la sucursal
    const { data: branchUsers } = await supabaseAdmin
      .from('user_branches')
      .select('user_id')
      .eq('branch_id', branch_id);

    if (!branchUsers?.length) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    const userIds = branchUsers.map(b => b.user_id);

    // Paso 2: traer todos los usuarios activos de la sucursal con su pin_hash
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, full_name, role, pin_hash, organization_id, email')
      .in('id', userIds)
      .eq('is_active', true);

    if (!users?.length) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    // Paso 3: comparar el PIN con bcrypt (nunca comparar en texto plano)
    const bcrypt = (await import('bcryptjs')).default;
    let matchedUser = null;
    for (const u of users) {
      if (u.pin_hash && await bcrypt.compare(pin, u.pin_hash)) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    res.json({
      user_id:   matchedUser.id,
      full_name: matchedUser.full_name,
      role:      matchedUser.role,
    });
  } catch (err) {
    logger.error('PIN login error', { err });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.use('/auth', authRouter);


// =============================================================================
// ─── RUTAS: PRODUCTOS ─────────────────────────────────────────────────────────
// =============================================================================

const productsRouter = express.Router();
productsRouter.use(requireAuth);

// GET /products?branch_id=&category_id=&search=&page=&limit=
productsRouter.get('/', async (req, res) => {
  try {
    const { branch_id, category_id, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = req.supabase
      .from('products')
      .select(`
        id, name, sku, barcode, price, cost, vat_rate, vat_included,
        track_inventory, unit_of_measure, min_stock, item_type,
        is_active, is_featured, metadata, image_url,
        categories(id, name, color),
        inventory(quantity, average_cost)
      `, { count: 'exact' })
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category_id) query = query.eq('category_id', category_id);
    if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.eq.${search}`);
    if (branch_id) query = query.eq('inventory.branch_id', branch_id);

    const { data, count, error } = await query;
    if (error) throw error;

    // Enriquecer con precios calculados (sin IVA para mostrar)
    const enriched = data.map(p => ({
      ...p,
      price_with_vat: p.vat_included ? p.price : Math.round(p.price * (1 + p.vat_rate / 100)),
      price_without_vat: p.vat_included ? Math.round(p.price / (1 + p.vat_rate / 100)) : p.price,
      current_stock: p.inventory?.[0]?.quantity ?? null,
    }));

    res.json({ data: enriched, count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    logger.error('GET /products', { err });
    res.status(500).json({ error: err.message });
  }
});

// GET /products/:id
productsRouter.get('/:id', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('products')
      .select('*, categories(*), product_variants(*), inventory(*)')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /products — Solo admin/owner
productsRouter.post('/', requireRole('owner', 'admin'), [
  body('name').notEmpty().trim(),
  body('price').isInt({ min: 0 }),
  body('vat_rate').isIn([0, 5, 19]),
  validate,
], async (req, res) => {
  try {
    const { name, price, cost = 0, vat_rate = 0, vat_included = true, ...rest } = req.body;

    const { data, error } = await req.supabase
      .from('products')
      .insert({ name, price, cost, vat_rate, vat_included, ...rest })
      .select()
      .single();

    if (error) throw error;
    await logAudit(req.organizationId, req.user.id, 'create', 'products', data.id, null, data);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/products', productsRouter);


// =============================================================================
// ─── RUTAS: SESIONES DE CAJA ──────────────────────────────────────────────────
// =============================================================================

const cashRouter = express.Router();
cashRouter.use(requireAuth);

// POST /cash-sessions/open
cashRouter.post('/open', [
  body('branch_id').isUUID(),
  body('opening_cash').isInt({ min: 0 }),
  validate,
], async (req, res) => {
  try {
    const { branch_id, opening_cash } = req.body;

    // Verificar que no haya una sesión abierta para este cajero
    const { data: existing } = await req.supabase
      .from('cash_sessions')
      .select('id')
      .eq('branch_id', branch_id)
      .eq('user_id', req.user.id)
      .eq('status', 'open')
      .single();

    if (existing) return res.status(409).json({ error: 'Ya tienes una caja abierta', session_id: existing.id });

    const { data, error } = await req.supabase
      .from('cash_sessions')
      .insert({ branch_id, user_id: req.user.id, opening_cash, status: 'open' })
      .select()
      .single();

    if (error) throw error;
    await logAudit(req.organizationId, req.user.id, 'cash_open', 'cash_sessions', data.id, null, { opening_cash });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cash-sessions/:id/close
cashRouter.post('/:id/close', [
  body('closing_cash').isInt({ min: 0 }),
  validate,
], async (req, res) => {
  try {
    const { id } = req.params;
    const { closing_cash, notes } = req.body;

    // Calcular totales de la sesión en el BACKEND
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select(`total, payments(payment_method, amount), discount_amount`)
      .eq('cash_session_id', id)
      .eq('status', 'paid');

    // ── Cálculo determinista en backend ──────────────────────────────────────
    const totals = { total_sales: 0, total_cash: 0, total_card: 0, total_nequi: 0, total_daviplata: 0, total_transfers: 0, total_discounts: 0 };

    for (const order of orders || []) {
      totals.total_sales    += order.total;
      totals.total_discounts += order.discount_amount || 0;
      for (const p of order.payments || []) {
        if      (p.payment_method === 'cash')        totals.total_cash       += p.amount;
        else if (p.payment_method.startsWith('card')) totals.total_card      += p.amount;
        else if (p.payment_method === 'nequi')        totals.total_nequi     += p.amount;
        else if (p.payment_method === 'daviplata')    totals.total_daviplata += p.amount;
        else if (p.payment_method === 'transfer')     totals.total_transfers += p.amount;
      }
    }

    const cash_difference = closing_cash - totals.total_cash; // Positivo = sobrante, Negativo = faltante

    const { data, error } = await supabaseAdmin
      .from('cash_sessions')
      .update({
        ...totals,
        closing_cash,
        cash_difference,
        closed_at: new Date().toISOString(),
        status: 'closed',
        notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Alerta si hay descuadre > $5.000 COP
    if (Math.abs(cash_difference) > 5000) {
      await supabaseAdmin.from('system_alerts').insert({
        organization_id: req.organizationId,
        alert_type: 'cash_discrepancy',
        severity: Math.abs(cash_difference) > 50000 ? 'high' : 'medium',
        title: `Descuadre de caja: ${cash_difference > 0 ? '+' : ''}$${cash_difference.toLocaleString('es-CO')} COP`,
        description: `Sesión ${id}. Cajero: ${req.user.full_name}`,
        data: { session_id: id, difference: cash_difference },
      });
    }

    await logAudit(req.organizationId, req.user.id, 'cash_close', 'cash_sessions', id, null, { closing_cash, cash_difference });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/cash-sessions', cashRouter);


// =============================================================================
// ─── RUTAS: ÓRDENES (CORAZÓN DEL POS) ────────────────────────────────────────
// =============================================================================

const ordersRouter = express.Router();
ordersRouter.use(requireAuth);

// POST /orders — Crear nueva orden
ordersRouter.post('/', [
  body('branch_id').isUUID(),
  body('cash_session_id').optional().isUUID(),
  body('order_type').isIn(['sale','delivery','table','appointment','work_order','quote']),
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').isUUID(),
  body('items.*.quantity').isFloat({ min: 0.001 }),
  validate,
], async (req, res) => {
  try {
    const {
      branch_id, cash_session_id, order_type = 'sale',
      customer_id, table_id, appointment_id,
      items, discount_type, discount_value, notes,
      payment_method, cash_received, metadata = {},
    } = req.body;

    // ── 1. Cargar productos desde BD (precios oficiales, nunca del cliente) ──
    const productIds = [...new Set(items.map(i => i.product_id))];
    const { data: products, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id, name, sku, price, cost, vat_rate, vat_included, track_inventory')
      .in('id', productIds);

    if (prodErr || products.length !== productIds.length) {
      return res.status(400).json({ error: 'Uno o más productos no encontrados' });
    }
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // ── 2. Calcular totales (BACKEND, cálculo determinista) ──────────────────
    let subtotal      = 0;
    let tax_total     = 0;
    const orderItems  = [];

    for (const item of items) {
      const prod = productMap[item.product_id];
      const qty  = item.quantity;

      // Precio base (sin IVA) y precio de venta (con IVA)
      const unit_price_with_vat = prod.price;
      const unit_price_base     = prod.vat_included
        ? Math.round(prod.price / (1 + prod.vat_rate / 100))
        : prod.price;
      const unit_vat_amount     = unit_price_with_vat - unit_price_base;

      const item_subtotal  = Math.round(unit_price_base * qty);
      const item_vat       = Math.round(unit_vat_amount * qty);
      const item_total     = item_subtotal + item_vat;

      subtotal  += item_subtotal;
      tax_total += item_vat;

      orderItems.push({
        product_id:   prod.id,
        product_name: prod.name,
        product_sku:  prod.sku,
        quantity:     qty,
        unit_price:   unit_price_with_vat,
        unit_cost:    prod.cost || 0,
        vat_rate:     prod.vat_rate,
        vat_amount:   item_vat,
        discount_amount: 0,
        subtotal:     item_subtotal,
        modifiers:    item.modifiers || [],
        notes:        item.notes,
        staff_user_id: item.staff_user_id || req.user.id,
      });
    }

    // ── 3. Aplicar descuento (validado y calculado en backend) ───────────────
    let discount_amount = 0;
    if (discount_type && discount_value) {
      if (discount_type === 'percentage') {
        if (discount_value < 0 || discount_value > 100) {
          return res.status(400).json({ error: 'Porcentaje de descuento inválido (0-100)' });
        }
        discount_amount = Math.round((subtotal + tax_total) * discount_value / 100);
      } else if (discount_type === 'fixed') {
        discount_amount = Math.round(Math.min(discount_value, subtotal + tax_total));
      }
    }

    const total = subtotal + tax_total - discount_amount;

    if (total < 0) return res.status(400).json({ error: 'El total no puede ser negativo' });

    // ── 4. Generar número de orden ────────────────────────────────────────────
    const { data: orderNumData } = await supabaseAdmin
      .rpc('generate_order_number', { p_branch_id: branch_id });
    const order_number = orderNumData || `ORD-${Date.now()}`;

    // ── 5. Insertar orden ─────────────────────────────────────────────────────
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert({
        branch_id, cash_session_id, order_type, order_number,
        customer_id, table_id, appointment_id,
        subtotal, tax_total, discount_amount, total,
        discount_type, discount_value, notes, metadata,
        status: 'open',
        created_by: req.user.id,
        staff_user_id: req.user.id,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // ── 6. Insertar ítems ─────────────────────────────────────────────────────
    const itemsWithOrderId = orderItems.map(i => ({ ...i, order_id: order.id }));
    const { error: itemsErr } = await supabaseAdmin.from('order_items').insert(itemsWithOrderId);
    if (itemsErr) throw itemsErr;

    // ── 7. Si hay pago inmediato, procesar ────────────────────────────────────
    if (payment_method) {
      await processPaymentInternal(order.id, payment_method, total, cash_received, req.user.id);
      await markOrderPaid(order.id, req.organizationId, req.user.id);
    }

    res.status(201).json({ ...order, items: itemsWithOrderId });
  } catch (err) {
    logger.error('POST /orders', { err });
    res.status(500).json({ error: err.message });
  }
});

// POST /orders/:id/payment — Registrar pago de orden existente
ordersRouter.post('/:id/payment', [
  body('payment_method').isIn(['cash','card_debit','card_credit','nequi','daviplata','transfer','loyalty_points','other']),
  body('amount').isInt({ min: 1 }),
  validate,
], async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, amount, cash_received, transaction_ref, gateway } = req.body;

    // Cargar orden
    const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', id).single();
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.status === 'paid') return res.status(409).json({ error: 'Orden ya pagada' });

    // Calcular vuelto (BACKEND, nunca la IA)
    let cash_change = 0;
    if (payment_method === 'cash' && cash_received) {
      if (cash_received < amount) {
        return res.status(400).json({ error: `Efectivo insuficiente. Recibido: $${cash_received.toLocaleString('es-CO')}` });
      }
      cash_change = cash_received - amount;
    }

    await processPaymentInternal(id, payment_method, amount, cash_received, req.user.id, transaction_ref, gateway, cash_change);

    // Verificar si la orden está totalmente pagada
    const { data: payments } = await supabaseAdmin
      .from('payments').select('amount').eq('order_id', id);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

    let orderStatus = order.status;
    if (totalPaid >= order.total) {
      await markOrderPaid(id, req.organizationId, req.user.id);
      orderStatus = 'paid';
    }

    res.json({ success: true, cash_change, total_paid: totalPaid, status: orderStatus });
  } catch (err) {
    logger.error('POST /orders/:id/payment', { err });
    res.status(500).json({ error: err.message });
  }
});

// POST /orders/:id/refund — Devolución (solo owner/admin)
ordersRouter.post('/:id/refund', requireRole('owner', 'admin'), [
  body('amount').isInt({ min: 1 }),
  body('reason').notEmpty(),
  body('refund_method').notEmpty(),
  validate,
], async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason, refund_method } = req.body;

    const { data: order } = await supabaseAdmin.from('orders').select('total').eq('id', id).single();
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (amount > order.total) return res.status(400).json({ error: 'Monto de devolución supera el total' });

    const { data: refund, error } = await supabaseAdmin.from('refunds').insert({
      order_id: id, amount, reason, refund_method,
      approved_by: req.user.id,
    }).select().single();

    if (error) throw error;

    // Revertir estado de la orden
    await supabaseAdmin.from('orders').update({ status: 'refunded' }).eq('id', id);

    await logAudit(req.organizationId, req.user.id, 'refund', 'orders', id, null, { amount, reason });
    res.json(refund);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: registrar pago en BD
async function processPaymentInternal(orderId, method, amount, cashReceived, userId, ref, gateway, cashChange = 0) {
  await supabaseAdmin.from('payments').insert({
    order_id: orderId,
    payment_method: method,
    amount,
    cash_received: cashReceived,
    cash_change: cashChange,
    transaction_ref: ref,
    gateway: gateway || 'manual',
    gateway_status: 'approved',
  }).throwOnError();
}

// Helper: marcar orden pagada + descontar inventario
async function markOrderPaid(orderId, organizationId, userId) {
  await supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', orderId);

  // Descontar inventario por cada ítem
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_id, variant_id, quantity, unit_cost')
    .eq('order_id', orderId);

  const { data: order } = await supabaseAdmin.from('orders').select('branch_id').eq('id', orderId).single();

  for (const item of items || []) {
    // Movimiento de inventario (salida = cantidad negativa)
    await supabaseAdmin.from('inventory_movements').insert({
      branch_id: order.branch_id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      movement_type: 'sale',
      quantity: -item.quantity,
      unit_cost: item.unit_cost,
      reference_type: 'order',
      reference_id: orderId,
      created_by: userId,
    });

    // Actualizar stock actual
    const { data: inv } = await supabaseAdmin
      .from('inventory')
      .select('quantity')
      .eq('branch_id', order.branch_id)
      .eq('product_id', item.product_id)
      .single();

    if (inv) {
      await supabaseAdmin.from('inventory').update({
        quantity: Math.max(0, inv.quantity - item.quantity),
        updated_at: new Date().toISOString(),
      })
      .eq('branch_id', order.branch_id)
      .eq('product_id', item.product_id);
    }
  }
}

app.use('/orders', ordersRouter);


// =============================================================================
// ─── RUTAS: INVENTARIO ────────────────────────────────────────────────────────
// =============================================================================

const inventoryRouter = express.Router();
inventoryRouter.use(requireAuth);

// GET /inventory?branch_id=&status=low_stock|out_of_stock
inventoryRouter.get('/', async (req, res) => {
  try {
    const { branch_id, status } = req.query;
    let query = req.supabase
      .from('v_inventory_status')
      .select('*')
      .order('stock_status', { ascending: true });

    if (branch_id) query = query.eq('branch_id', branch_id);
    if (status)    query = query.eq('stock_status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/adjustment — Ajuste manual (solo owner/admin)
inventoryRouter.post('/adjustment', requireRole('owner', 'admin'), [
  body('branch_id').isUUID(),
  body('product_id').isUUID(),
  body('quantity_delta').isFloat(),   // Puede ser negativo (baja) o positivo (entrada)
  body('reason').notEmpty(),
  validate,
], async (req, res) => {
  try {
    const { branch_id, product_id, quantity_delta, reason, variant_id } = req.body;

    // Cargar stock actual
    const { data: inv } = await supabaseAdmin.from('inventory')
      .select('quantity').eq('branch_id', branch_id).eq('product_id', product_id).single();

    const newQty = Math.max(0, (inv?.quantity || 0) + quantity_delta);

    await supabaseAdmin.from('inventory').upsert({
      branch_id, product_id, variant_id,
      quantity: newQty,
      updated_at: new Date().toISOString(),
    });

    await supabaseAdmin.from('inventory_movements').insert({
      branch_id, product_id, variant_id,
      movement_type: quantity_delta < 0 ? 'waste' : 'adjustment',
      quantity: quantity_delta,
      notes: reason,
      reference_type: 'manual',
      created_by: req.user.id,
    });

    await logAudit(req.organizationId, req.user.id, 'inventory_adjustment', 'inventory', product_id, { quantity: inv?.quantity }, { quantity: newQty, reason });
    res.json({ success: true, previous_qty: inv?.quantity, new_qty: newQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/inventory', inventoryRouter);


// =============================================================================
// ─── RUTAS: AGENTE IA ─────────────────────────────────────────────────────────
// =============================================================================

const aiRouter = express.Router();
aiRouter.use(requireAuth);
aiRouter.use(aiRateLimit);

// POST /ai/chat — Conversación general con el agente
aiRouter.post('/chat', [
  body('message').notEmpty().isLength({ max: 2000 }),
  body('branch_id').isUUID(),
  validate,
], async (req, res) => {
  try {
    const { message, branch_id, conversation_history = [] } = req.body;

    // Cargar contexto del negocio
    const { data: org } = await supabaseAdmin.from('organizations')
      .select('name, business_type').eq('id', req.organizationId).single();

    const context = {
      organization_id: req.organizationId,
      branch_id,
      business_type: org?.business_type,
      business_name:  org?.name,
      user_name:      req.user.full_name,
      user_role:      req.user.role,
      supabase:       supabaseAdmin,
    };

    // Guardar mensaje del usuario en historial
    await supabaseAdmin.from('ai_chat_history').insert({
      organization_id: req.organizationId,
      user_id: req.user.id,
      role: 'user',
      content: message,
    });

    const result = await runFerzuAgent(message, conversation_history, context);

    // Guardar respuesta del asistente
    await supabaseAdmin.from('ai_chat_history').insert({
      organization_id: req.organizationId,
      user_id: req.user.id,
      role: 'assistant',
      content: result.text,
      model: result.model_used,
      tokens_used: result.tokens_used,
    });

    res.json({
      text: result.text,
      proposals_created: result.tool_results.filter(t => t.tool === 'create_ai_proposal').length,
      tokens_used: result.tokens_used,
    });
  } catch (err) {
    logger.error('POST /ai/chat', { err });
    res.status(500).json({ error: 'Error del agente IA. Intenta de nuevo.' });
  }
});

// POST /ai/analyze-invoice — Analizar factura de proveedor (imagen o PDF)
aiRouter.post('/analyze-invoice', [
  body('invoice_id').isUUID(),
  body('branch_id').isUUID(),
  validate,
], async (req, res) => {
  try {
    const { invoice_id, branch_id } = req.body;

    // Cargar la factura
    const { data: invoice } = await supabaseAdmin
      .from('supplier_invoices')
      .select('*, suppliers(name)')
      .eq('id', invoice_id)
      .single();

    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    // Descargar imagen desde Supabase Storage
    const { data: fileData } = await supabaseAdmin.storage
      .from('invoices')
      .download(invoice.file_url);

    const base64 = Buffer.from(await fileData.arrayBuffer()).toString('base64');
    const mediaType = invoice.file_type === 'pdf' ? 'application/pdf' : `image/${invoice.file_type}`;

    // Marcar como en proceso
    await supabaseAdmin.from('supplier_invoices')
      .update({ ai_processing_status: 'processing' }).eq('id', invoice_id);

    const context = {
      organization_id: req.organizationId,
      branch_id,
      business_type: 'minimarket',
      business_name: 'FERZU',
      user_name: req.user.full_name,
      user_role: req.user.role,
      supabase: supabaseAdmin,
    };

    const prompt = `Analiza esta factura de proveedor${invoice.suppliers ? ' de ' + invoice.suppliers.name : ''}.
    Extrae todos los productos, cantidades, precios unitarios e IVA.
    Luego crea una propuesta de ingreso al inventario para que el usuario la apruebe.`;

    // Llamada multimodal a Claude (imagen + texto)
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ]
      }],
    });

    await supabaseAdmin.from('supplier_invoices')
      .update({ ai_processing_status: 'completed' }).eq('id', invoice_id);

    res.json({ success: true, result: response.content[0].text });
  } catch (err) {
    await supabaseAdmin.from('supplier_invoices')
      .update({ ai_processing_status: 'failed' }).eq('id', req.body.invoice_id);
    res.status(500).json({ error: err.message });
  }
});

// GET /ai/proposals — Listar propuestas pendientes
aiRouter.get('/proposals', async (req, res) => {
  try {
    const { status = 'pending', branch_id } = req.query;
    let query = req.supabase
      .from('ai_proposals')
      .select('*')
      .eq('status', status)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (branch_id) query = query.eq('branch_id', branch_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ai/proposals/:id/approve — Aprobar propuesta (acción del usuario)
aiRouter.post('/proposals/:id/approve', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Cargar propuesta
    const { data: proposal } = await supabaseAdmin
      .from('ai_proposals').select('*').eq('id', id).single();

    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (proposal.status !== 'pending') return res.status(409).json({ error: `Propuesta ya ${proposal.status}` });
    if (new Date(proposal.expires_at) < new Date()) {
      await supabaseAdmin.from('ai_proposals').update({ status: 'expired' }).eq('id', id);
      return res.status(410).json({ error: 'Propuesta expirada' });
    }

    // Importar y ejecutar el aprobador
    const { executeApprovedProposal } = await import('./ferzu_claude_tools.js');
    const context = { organization_id: req.organizationId, branch_id: proposal.branch_id, supabase: supabaseAdmin };
    const result = await executeApprovedProposal(id, req.user.id, context);

    res.json({ success: true, affected_records: result.affected_records });
  } catch (err) {
    logger.error('POST /ai/proposals/:id/approve', { err });
    res.status(500).json({ error: err.message });
  }
});

// POST /ai/proposals/:id/reject
aiRouter.post('/proposals/:id/reject', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await supabaseAdmin.from('ai_proposals').update({
      status: 'rejected',
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: reason,
    }).eq('id', id);

    await logAudit(req.organizationId, req.user.id, 'reject', 'ai_proposals', id, null, { reason });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/ai', aiRouter);


// =============================================================================
// ─── RUTAS: SINCRONIZACIÓN OFFLINE ───────────────────────────────────────────
// =============================================================================

const syncRouter = express.Router();
syncRouter.use(requireAuth);

// POST /sync/push — El cliente envía operaciones pendientes de offline
syncRouter.post('/push', [
  body('operations').isArray(),
  validate,
], async (req, res) => {
  try {
    const { operations } = req.body;
    const results = [];

    for (const op of operations) {
      try {
        // Validar que pertenece a la organización correcta
        const result = await processSyncOperation(op, req.organizationId, req.user.id);
        results.push({ local_id: op.local_id, success: true, server_id: result?.id });
      } catch (err) {
        results.push({ local_id: op.local_id, success: false, error: err.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    res.json({ processed: operations.length, successful, failed: operations.length - successful, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crea una orden simple desde una operación offline (sync)
async function createOrderFromSync(payload, organizationId, userId) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .insert({ ...payload, created_by: userId, synced_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function processSyncOperation(op, organizationId, userId) {
  switch (op.table_name) {
    case 'orders':
      if (op.operation === 'INSERT') {
        return await createOrderFromSync(op.payload, organizationId, userId);
      }
      break;
    case 'inventory_movements':
      if (op.operation === 'INSERT') {
        const { data } = await supabaseAdmin.from('inventory_movements')
          .insert({ ...op.payload, created_by: userId }).select().single();
        return data;
      }
      break;
    default:
      throw new Error(`Tabla no soportada para sync: ${op.table_name}`);
  }
}

app.use('/sync', syncRouter);


// =============================================================================
// ─── RUTAS: REPORTES ─────────────────────────────────────────────────────────
// =============================================================================

const reportsRouter = express.Router();
reportsRouter.use(requireAuth);

// GET /reports/dashboard?branch_id=&date=YYYY-MM-DD
reportsRouter.get('/dashboard', async (req, res) => {
  try {
    const { branch_id, date = new Date().toISOString().split('T')[0] } = req.query;

    const [salesResult, topProductsResult, alertsResult] = await Promise.all([
      // Ventas del día
      supabaseAdmin.from('v_daily_sales').select('*')
        .eq('branch_id', branch_id).eq('sale_date', date).single(),

      // Top 5 productos
      supabaseAdmin.from('v_product_profitability').select('*')
        .order('total_revenue', { ascending: false }).limit(5),

      // Alertas activas
      supabaseAdmin.from('system_alerts').select('*')
        .eq('is_resolved', false).order('created_at', { ascending: false }).limit(10),
    ]);

    res.json({
      today_sales:  salesResult.data,
      top_products: topProductsResult.data,
      alerts:       alertsResult.data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/reports', reportsRouter);


// =============================================================================
// ─── HEALTH CHECK Y ARRANQUE ─────────────────────────────────────────────────
// =============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', ts: new Date().toISOString() });
});

// =============================================================================
// ─── RUTAS INTERNAS — SOLO ENTORNO LOCAL ─────────────────────────────────────
// SECURITY: estos endpoints están DESHABILITADOS en producción.
// Las migraciones se ejecutan desde CLI local, nunca vía HTTP en producción.
// =============================================================================
if (process.env.NODE_ENV !== 'production') {
  // Solo disponible en desarrollo local: sirve la página HTML de despliegue
  app.get('/deploy-schema', async (req, res) => {
    try {
      const { readFileSync }  = await import('fs');
      const { fileURLToPath } = await import('url');
      const pathMod           = await import('path');
      const __dir = pathMod.default.dirname(fileURLToPath(import.meta.url));
      const htmlPath = pathMod.default.join(__dir, '..', 'DEPLOY_SCHEMA.html');
      const html = readFileSync(htmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      res.status(500).send('Error: ' + err.message);
    }
  });

  // Solo disponible en desarrollo local: ejecuta migraciones SQL
  app.get('/api/internal/migrate', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    logger.warn('[MIGRATE] Endpoint de migración llamado en modo local');
    res.json({ disabled: true, reason: 'Ejecuta las migraciones desde Supabase Dashboard o CLI local.' });
  });
} else {
  // En producción: devuelve 404 para no revelar que el endpoint existió
  app.get('/deploy-schema',        (req, res) => res.status(404).end());
  app.get('/api/internal/migrate', (req, res) => res.status(404).end());
}

// Manejo global de errores
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { err: err.message, stack: err.stack });
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  logger.info(`FERZU Backend corriendo en puerto ${PORT}`);
});

// =============================================================================
// ─── CRON: EMAIL AUTOMÁTICO — DÍA 10 DE TRIAL ────────────────────────────────
// Corre todos los días a las 9:00 AM hora Colombia (UTC-5 → 14:00 UTC)
// Busca organizaciones creadas hace exactamente 10 días y envía un email
// con resumen de ventas + CTA para suscribirse antes de que expire el trial.
// =============================================================================

const resend = new Resend(process.env.RESEND_API_KEY);

function buildTrialReminderEmail({ orgName, ownerEmail, totalVentas, numTransacciones, diasRestantes }) {
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
    from: process.env.RESEND_FROM_EMAIL || 'FERZU POS <onboarding@resend.dev>',
    to: ownerEmail,
    subject: `⏰ Quedan ${diasRestantes} días de tu prueba gratis — ${orgName}`,
    html,
  };
}

// Job: corre todos los días a las 9:00 AM hora Colombia (14:00 UTC)
cron.schedule('0 14 * * *', async () => {
  logger.info('[CRON] Iniciando job: recordatorio trial día 10');

  try {
    // Orgs creadas hace exactamente 10 días (en UTC — Railway corre en UTC)
    const now = new Date();
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
        // Obtener email del dueño via admin API
        const { data: { user }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(org.owner_id);
        if (userErr || !user?.email) {
          logger.warn('[CRON] No se pudo obtener email del owner', { org: org.id });
          continue;
        }

        // Resumen de ventas durante el trial (primeros 10 días)
        const { data: orders } = await supabaseAdmin
          .from('orders')
          .select('total_amount')
          .eq('organization_id', org.id)
          .eq('status', 'completed')
          .gte('created_at', org.created_at)
          .lte('created_at', now.toISOString());

        const numTransacciones = orders?.length ?? 0;
        const totalVentas = orders?.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) ?? 0;

        // Calcular días restantes del trial (14 días total)
        const trialStart = new Date(org.created_at);
        const trialEnd = new Date(trialStart);
        trialEnd.setDate(trialEnd.getDate() + 14);
        const diasRestantes = Math.max(1, Math.round((trialEnd - now) / (1000 * 60 * 60 * 24)));

        // Construir y enviar email
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

// =============================================================================
// ERROR BACKUP SYSTEM
// Solo se activa durante percances — costo CERO en operación normal.
// 1. POST /api/errors → recibe errores del frontend y los persiste
// 2. process.on uncaughtException / unhandledRejection → captura crashes del proceso
// =============================================================================

// --- Endpoint público (no requiere auth): recibe snapshot de error del frontend ---
app.post('/api/errors', async (req, res) => {
  try {
    const {
      errorId, source, message, stack, componentStack,
      url, userAgent, timestamp,
    } = req.body;

    if (!message) return res.status(400).json({ error: 'message requerido' });

    const payload = {
      error_id:         errorId || `fe-${Date.now()}`,
      source:           source || 'frontend',
      message:          String(message).substring(0, 500),
      stack:            stack           ? String(stack).substring(0, 2000)          : null,
      component_stack:  componentStack  ? String(componentStack).substring(0, 1000) : null,
      url:              url             ? String(url).substring(0, 300)             : null,
      user_agent:       userAgent       ? String(userAgent).substring(0, 300)       : null,
      occurred_at:      timestamp || new Date().toISOString(),
    };

    // Log inmediato con winston (persiste en logs/error.log en Railway)
    logger.error('[ERROR_BACKUP] Frontend error', payload);

    // Persistir en Supabase si la tabla existe (best-effort)
    try {
      await supabaseAdmin
        .from('error_logs')
        .insert([payload]);
    } catch (_) { /* tabla puede no existir aún — el log de winston es suficiente */ }

    res.json({ received: true, errorId: payload.error_id });
  } catch (err) {
    logger.error('[ERROR_BACKUP] Error en endpoint /api/errors', { error: err.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- Handlers de proceso: capturan crashes antes de morir ---

process.on('uncaughtException', (err) => {
  logger.error('[PROCESO] uncaughtException — el proceso va a terminar', {
    message: err.message,
    stack:   err.stack?.substring(0, 2000),
    ts:      new Date().toISOString(),
  });
  // Dar 500ms para que Winston vacíe el buffer antes de salir
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stk = reason instanceof Error ? reason.stack?.substring(0, 2000) : null;
  logger.error('[PROCESO] unhandledRejection — promesa sin .catch()', {
    message: msg,
    stack:   stk,
    ts:      new Date().toISOString(),
  });
  // No matamos el proceso en rejection — solo logueamos
});

export default app;
