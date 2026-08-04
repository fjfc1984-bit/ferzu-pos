# 🚀 FERZU POS — Documento de Entrega (Estado Actual del Proyecto)

> **Fecha de corte:** 2026-08-04  
> **Último commit en main:** `363ab94 fix(customers): agregar organization_id en INSERT para pasar RLS`  
> **Rama activa:** `fix/client-errors-aug2026` (cambios no pusheados aún — ver §4)

---

## 1. Descripción General

**FERZU POS** es un sistema de Punto de Venta SaaS multi-tenant para negocios colombianos (restaurantes, barberías, minimarkets, talleres). Está diseñado como una plataforma modular con planes de suscripción.

### Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 18 + Vite 5 + Tailwind CSS 3 |
| **Backend** | Node.js 22 + Express — desplegado en Railway |
| **Base de datos** | Supabase (PostgreSQL + RLS + Auth) |
| **IA** | Anthropic SDK — Claude Haiku (Q&A rápido) + Claude Sonnet (agente con tool calling) |
| **Offline** | Dexie.js (IndexedDB) + Service Worker |
| **DIAN** | Facturación electrónica UBL 2.1 (módulo interno) |
| **Deploy** | Vercel (frontend) + Railway (backend) |

### URLs de producción
- **Frontend:** https://ferzu-pos.vercel.app  
- **Backend:** https://ferzu-backend-production.up.railway.app  
- **Supabase project:** `laimnfckldpiovgbugyr`

### Repositorio
- **GitHub:** https://github.com/fjfc1984-bit/ferzu-pos  
- **Rama principal:** `main` (auto-deploy a Vercel + Railway en cada push)

---

## 2. Estructura del Proyecto

```
ferzu-pos/
├── backend/
│   ├── config/
│   │   ├── supabase.js          # supabaseAdmin (service_role), supabasePublic
│   │   ├── rateLimits.js        # aiRateLimit, generalLimit
│   │   └── logger.js            # Winston logger
│   ├── lib/
│   │   ├── claudeTools.js       # ★ queryBusinessData() — herramientas del agente IA
│   │   └── dian.js              # Lógica DIAN UBL 2.1
│   ├── middleware/
│   │   ├── auth.js              # requireAuth, requireRole (JWT Supabase)
│   │   ├── audit.js             # logAudit()
│   │   └── validate.js          # express-validator middleware
│   ├── routes/
│   │   ├── ai.routes.js         # ★ POST /ai/chat + POST /ai/business-chat
│   │   ├── orders.routes.js     # ★ Lógica de cortesías (F10)
│   │   ├── products.routes.js   # + variantes (F9-C)
│   │   ├── cash.routes.js       # F9-B: apertura/cierre de caja
│   │   ├── loyalty.routes.js    # F9-A: programa de fidelización
│   │   ├── shifts.routes.js     # F3: turnos y asistencia
│   │   ├── tables.routes.js     # F2: mesas
│   │   ├── integrations.routes.js # F4: hub de integraciones
│   │   ├── dian.routes.js       # F6: facturación electrónica
│   │   └── reports.routes.js    # F8: reportes avanzados
│   ├── ferzu_claude_tools.js    # runFerzuAgent() — loop agente Sonnet
│   └── server.js                # Express app + mount de rutas
│
├── src/
│   ├── components/
│   │   ├── AIAssistant.jsx      # ★ Widget flotante IA (dual-modo: quick + agent)
│   │   ├── AIBusinessChat.jsx   # Componente auxiliar (integrado en AIAssistant)
│   │   ├── ModuleGuard.jsx      # Planes SaaS + AdaptiveNav + MobileBottomNav
│   │   ├── OfflineBanner.jsx    # Banner de estado offline
│   │   └── PaymentModal.jsx     # F1: propinas nativas
│   ├── context/
│   │   ├── AuthContext.jsx      # Auth Supabase + PIN lock + organizationId
│   │   ├── POSContext.jsx       # ★ Estado POS (incl. cortesías F10)
│   │   └── SyncContext.jsx      # Sincronización offline
│   ├── lib/
│   │   ├── api.js               # Axios con baseURL + token interceptor
│   │   ├── db.js                # Dexie IndexedDB schema
│   │   └── offlineCache.js      # Cache offline utils
│   ├── pages/
│   │   ├── DashboardPage.jsx    # Dashboard con botón IA integrado
│   │   ├── POSPage.jsx          # ★ Terminal POS + CourtesyModal (F10)
│   │   ├── DailyReportPage.jsx  # Reportes diarios + sección cortesías
│   │   ├── InventoryPage.jsx    # Inventario + variantes
│   │   ├── CustomersPage.jsx    # Clientes + programa fidelización
│   │   ├── ShiftsPage.jsx       # F3: turnos
│   │   ├── TablesPage.jsx       # F2: mesas drag-and-drop
│   │   ├── IntegrationsPage.jsx # F4: hub integraciones
│   │   ├── DianPage.jsx         # F6: DIAN
│   │   └── auth/
│   │       ├── LoginPage.jsx
│   │       ├── AuthScreens.jsx  # Register, ForgotPassword, ResetPassword
│   │       ├── BranchSelector.jsx
│   │       ├── OnboardingWizard.jsx
│   │       └── PINLockScreen.jsx
│   └── App.jsx                  # Rutas + AppShell + POSShell
│
├── migration_variants.sql       # ★ F9-C: product_variants + variant_inventory
├── migration_courtesy.sql       # ★ F10: columnas cortesía (archivo LOCAL — ver §4)
├── migration_loyalty.sql        # F9-A: programa de puntos
├── migration_shifts.sql         # F3: turnos
├── run-migrations.ps1           # Script PowerShell para migraciones
└── vite.config.js
```

---

## 3. Estado Actual — Qué Funciona

### Funcionalidades completadas y deployadas (F1–F11):

| ID | Feature | Estado |
|---|---|---|
| **F1** | Propinas nativas en PaymentModal | ✅ En producción |
| **F2** | Editor visual de mesas (drag & drop) | ✅ En producción |
| **F3** | Módulo de turnos y asistencia (reloj checador) | ✅ En producción |
| **F4** | Hub de integraciones externas | ✅ En producción |
| **F5** | Modo offline total (Service Worker + Dexie) | ✅ En producción |
| **F6** | Facturación electrónica DIAN (UBL 2.1) | ✅ En producción |
| **F7** | Dashboard móvil — nav responsive + grids | ✅ En producción |
| **F8** | Reportes avanzados — WoW comparisons + PDF semanal | ✅ En producción |
| **F9-A** | Programa de fidelización — motor de puntos | ✅ En producción |
| **F9-B** | Apertura y cierre de caja — conteo, cuadre | ✅ En producción |
| **F9-C** | Variantes de producto — tallas, colores, presentaciones | ✅ Migración en Supabase ejecutada; **pendiente push del código frontend** |
| **F10** | Cortesías — modal, backend, reportes | ✅ Migración en Supabase ejecutada; **pendiente push** |
| **F11** | Asistente IA dual-modo (Haiku + Sonnet) | ✅ Implementado; **pendiente push** |

### Arquitectura de IA (F11) — Funcionando:

El `AIAssistant.jsx` tiene **dos modos** accesibles via tabs en el widget flotante:

- **⚡ Consulta rápida** (`mode='quick'`): Llama a `POST /api/ai/business-chat`. El backend construye un snapshot real de los últimos 7 días (ventas, top productos, sesiones de caja, inventario) usando `queryBusinessData()` en paralelo con `Promise.allSettled`, lo inyecta en el system prompt, y responde con **Claude Haiku** (rápido, barato, sin tool calling). Timeout: 30 s.

- **🔧 Agente avanzado** (`mode='agent'`): Llama a `POST /api/ai/chat`. Usa `runFerzuAgent()` con **Claude Sonnet + 6 tools** (query, proposal, etc.). Al abrir, hace un "pulse proactivo" consultando el estado del negocio. Timeout: 60 s.

**Seguridad de rol**: Los cajeros (`cashier`/`cajero`) solo pueden preguntar por su sesión de caja activa. El backend bloquea el acceso a métricas sensibles por rol.

### Migraciones SQL ejecutadas en Supabase:

Ambas se ejecutaron directamente en el SQL Editor de Supabase (project `laimnfckldpiovgbugyr`) via automatización de browser (Claude in Chrome), con resultado `Success. No rows returned`:

1. **F9-C (Variantes):** `product_variants` (ADD COLUMN IF NOT EXISTS para org_id, sku, price, cost, attributes, is_active, sort_order, timestamps) + `variant_inventory` + índices + RLS policies + función `decrement_variant_inventory`.

2. **F10 (Cortesías):** `order_items.is_courtesy`, `order_items.courtesy_reason`, `orders.is_courtesy`, `orders.courtesy_authorized_by`, `orders.courtesy_reason`, `orders.courtesy_amount` + `idx_orders_is_courtesy` + vista `vw_courtesy_report` (corregida).

---

## 4. Problemas y Estado de los Cambios

### ⚠️ CAMBIOS SIN PUSHEAR

Hay una gran cantidad de archivos modificados/creados que **NO han sido commiteados ni pusheados** a GitHub. El último commit en `main` es `363ab94`. Todo el trabajo de F9-C, F10, F11 existe solo en el filesystem local (`C:\Users\fjfc1\Downloads\ferzu-pos`).

**Primer paso obligatorio en el nuevo chat:** hacer commit y push con el skill `ferzu-pos:commit`.

### ⚠️ `migration_courtesy.sql` — Bug en el archivo LOCAL

El archivo local `migration_courtesy.sql` tiene un bug en la vista `vw_courtesy_report`: en la línea del SELECT usa `o.organization_id` (que no existe en la tabla `orders`) y en el GROUP BY no incluye `b.organization_id`:

```sql
-- ❌ VERSIÓN INCORRECTA (en el archivo local):
SELECT ... o.organization_id ...
FROM orders o
JOIN branches b ON b.id = o.branch_id
...
GROUP BY o.id, b.name;
-- ERROR: column "o.organization_id" does not exist
```

**Ya se ejecutó la versión corregida directamente en Supabase** (la vista existe y es correcta en la DB). Pero el archivo local debe corregirse antes del push:

```sql
-- ✅ VERSIÓN CORRECTA (ya en Supabase):
SELECT
  o.id, o.created_at, o.branch_id,
  b.name AS branch_name,
  o.courtesy_authorized_by, o.courtesy_reason, o.courtesy_amount,
  b.organization_id,          -- ← viene de branches, NO de orders
  COUNT(oi.id) AS item_count
FROM orders o
JOIN branches b ON b.id = o.branch_id
LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.is_courtesy = TRUE
WHERE o.is_courtesy = TRUE AND o.status = 'paid'
GROUP BY o.id, b.name, b.organization_id;  -- ← b.organization_id en GROUP BY
```

**Acción:** corregir `migration_courtesy.sql` líneas 33-49 antes del commit.

### ⚠️ `migration_variants.sql` — `product_variants` ya existía

La tabla `product_variants` ya existía en Supabase con un schema diferente (tenía `sku_variant` en lugar de `sku`, sin `organization_id`). La migración que se ejecutó en Supabase fue una versión **adaptiva** con `ALTER TABLE ADD COLUMN IF NOT EXISTS`, no el `CREATE TABLE IF NOT EXISTS` que está en el archivo local.

El `migration_variants.sql` local usa `CREATE TABLE IF NOT EXISTS` — si alguien lo corre de nuevo en una DB nueva funcionará, pero en la DB de producción ya está resuelto vía ALTER TABLE.

---

## 5. Código Fuente de los Archivos Clave

### `backend/routes/ai.routes.js` — Rutas IA (completo)

```javascript
// =============================================================================
// FERZU POS — AI Routes  (/api/ai)
// =============================================================================
import express  from 'express';
import { body } from 'express-validator';
import { supabaseAdmin }      from '../config/supabase.js';
import logger                 from '../config/logger.js';
import { aiRateLimit }        from '../config/rateLimits.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate }           from '../middleware/validate.js';
import { logAudit }           from '../middleware/audit.js';
import { runFerzuAgent }      from '../ferzu_claude_tools.js';
import { queryBusinessData } from '../lib/claudeTools.js';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
router.use(requireAuth);
router.use(aiRateLimit);

// POST /ai/chat — Agente avanzado con tool calling (Claude Sonnet)
router.post('/chat', [
  body('message').notEmpty().isLength({ max: 2000 }),
  body('branch_id').optional({ nullable: true }).matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  validate,
], async (req, res) => {
  try {
    const { message, branch_id, conversation_history = [], page_context } = req.body;

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, business_type')
      .eq('id', req.organizationId)
      .single();

    const context = {
      organization_id: req.organizationId,
      branch_id:       branch_id || null,
      business_type:   org?.business_type,
      business_name:   org?.name,
      user_name:       req.user.full_name,
      user_role:       req.user.role,
      page_context:    page_context || null,
      supabase:        supabaseAdmin,
    };

    try {
      await supabaseAdmin.from('ai_chat_history').insert({
        organization_id: req.organizationId,
        user_id:         req.user.id,
        role:            'user',
        content:         message,
      });
    } catch (_) {}

    const result = await runFerzuAgent(message, conversation_history, context);

    try {
      await supabaseAdmin.from('ai_chat_history').insert({
        organization_id: req.organizationId,
        user_id:         req.user.id,
        role:            'assistant',
        content:         result.text,
        model:           result.model_used,
        tokens_used:     result.tokens_used,
      });
    } catch (_) {}

    res.json({
      text:              result.text,
      proposals_created: (result.tool_results || []).filter(t => t.tool === 'create_ai_proposal').length,
      tokens_used:       result.tokens_used,
    });
  } catch (err) {
    logger.error('POST /ai/chat', { err });
    res.status(500).json({ error: 'Error del agente IA. Intenta de nuevo.' });
  }
});

// =============================================================================
// POST /ai/business-chat — Asistente financiero rápido (sin tool calling)
// Inyecta snapshot real del negocio en system prompt → Claude Haiku
// ROL: cajero → solo sesión de caja activa
//      dueño/gerente/admin → snapshot completo 7 días
// =============================================================================
const SENSITIVE_ROLES = ['cashier', 'cajero'];

async function buildBusinessSnapshot(orgId, branchId, userRole, supabase) {
  const ctx = { organization_id: orgId, branch_id: branchId, supabase };
  const isCashier = SENSITIVE_ROLES.includes((userRole || '').toLowerCase());

  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  if (isCashier) {
    const cashSession = await queryBusinessData(
      { query_type: 'cash_session_summary', filters: { branch_id: branchId, limit: 1 }, natural_language_question: 'sesión actual' },
      ctx
    );
    return {
      perfil_usuario: 'Cajero — acceso restringido',
      sesion_caja_activa: cashSession.data?.[0] || null,
    };
  }

  const [ventas, topProductos, caja, inventario] = await Promise.allSettled([
    queryBusinessData({ query_type: 'daily_sales',   filters: { branch_id: branchId, date_from: weekAgo, date_to: today, limit: 7 }, natural_language_question: 'ventas últimos 7 días' }, ctx),
    queryBusinessData({ query_type: 'top_products',  filters: { branch_id: branchId, date_from: weekAgo, date_to: today, limit: 5 }, natural_language_question: 'top 5 productos' }, ctx),
    queryBusinessData({ query_type: 'cash_session_summary', filters: { branch_id: branchId, limit: 3 }, natural_language_question: 'resumen sesiones' }, ctx),
    queryBusinessData({ query_type: 'inventory_status',     filters: { branch_id: branchId, limit: 10 }, natural_language_question: 'inventario bajo' }, ctx),
  ]);

  return {
    periodo_analizado:  `${weekAgo} al ${today}`,
    ventas_ultimos_7d:  ventas.status      === 'fulfilled' ? ventas.value.data      : null,
    top_5_productos:    topProductos.status === 'fulfilled' ? topProductos.value.data : null,
    sesiones_caja:      caja.status        === 'fulfilled' ? caja.value.data         : null,
    inventario_muestra: inventario.status  === 'fulfilled' ? inventario.value.data   : null,
  };
}

function buildSystemPrompt(org, userRole, snapshot, currentDatetime) {
  const isCashier = SENSITIVE_ROLES.includes((userRole || '').toLowerCase());
  const rolesLabel = {
    owner: 'Dueño', admin: 'Administrador', manager: 'Gerente',
    cashier: 'Cajero', cajero: 'Cajero',
  };

  return `Eres el asistente financiero y operativo de ${org.name || 'este negocio'}, asignado exclusivamente a este establecimiento.

<contexto_negocio>
- Negocio: ${org.name || 'N/A'}
- Sector: ${org.business_type || 'Restaurante / Comercio'}
- Rol del Usuario interactuando: ${rolesLabel[userRole] || userRole || 'Usuario'}
- Fecha y Hora actual: ${currentDatetime}
</contexto_negocio>

<reglas_estrictas>
1. SEGURIDAD DE ROL: ${isCashier
    ? 'Este usuario es Cajero. SOLO puedes responder preguntas sobre su sesión de caja activa. Si pregunta por ganancias netas, costos, reportes mensuales u otras métricas sensibles, responde: "Esa información requiere permisos de Administrador."'
    : 'Este usuario tiene acceso completo. Puedes responder todas las preguntas sobre el negocio.'}
2. CERO ALUCINACIÓN: Responde ÚNICA Y EXCLUSIVAMENTE basándote en los datos de <datos_del_negocio>. Si el dato no está disponible, di: "Esa información no está disponible en el reporte actual."
3. FORMATO: Ultra-conciso. Sin saludos largos. Usa viñetas solo si hay más de dos elementos. Usa **negritas** para números importantes.
4. MONEDA: Formato colombiano: $45.000 COP. Fechas en DD/MM/YYYY.
5. PRIVACIDAD: Nunca menciones "FERZU POS" ni plataformas tecnológicas.
</reglas_estrictas>

<datos_del_negocio>
${JSON.stringify(snapshot, null, 2)}
</datos_del_negocio>`;
}

router.post('/business-chat', [
  body('message').notEmpty().isLength({ max: 1000 }),
  body('branch_id').optional({ nullable: true }).isUUID(),
  body('conversation_history').optional().isArray({ max: 20 }),
  validate,
], async (req, res) => {
  try {
    const { message, branch_id, conversation_history = [] } = req.body;
    const branchId = branch_id || req.headers['x-branch-id'] || null;

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, business_type')
      .eq('id', req.organizationId)
      .single();

    const snapshot = await buildBusinessSnapshot(
      req.organizationId,
      branchId,
      req.user.role,
      supabaseAdmin
    );

    const now = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const systemPrompt = buildSystemPrompt(org || {}, req.user.role, snapshot, now);

    const history = (conversation_history || []).slice(-10);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response  = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [...history, { role: 'user', content: message }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

    // Fire-and-forget
    supabaseAdmin.from('ai_chat_history').insert([
      { organization_id: req.organizationId, user_id: req.user.id, role: 'user',      content: message },
      { organization_id: req.organizationId, user_id: req.user.id, role: 'assistant', content: text, model: 'claude-haiku-4-5-20251001', tokens_used: response.usage.input_tokens + response.usage.output_tokens },
    ]).then(() => {}).catch(() => {});

    res.json({
      text,
      tokens_used:   response.usage.input_tokens + response.usage.output_tokens,
      snapshot_keys: Object.keys(snapshot),
    });
  } catch (err) {
    logger.error('POST /ai/business-chat', { err });
    res.status(500).json({ error: 'Error del asistente. Intenta de nuevo.' });
  }
});

export default router;
```

---

### `src/components/AIAssistant.jsx` — Widget IA dual-modo (completo)

```jsx
// =============================================================================
// FERZU POS — Asistente Virtual IA (widget flotante)
// Modo 'quick' → POST /api/ai/business-chat (Haiku + snapshot)
// Modo 'agent' → POST /api/ai/chat (Sonnet + tool calling)
// =============================================================================
import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const PAGE_SUGGESTIONS = {
  '/dashboard':  ['¿Cómo van las ventas hoy?', '¿Qué productos vender más?', '¿Hay alertas urgentes?'],
  '/pos':        ['¿Cómo aplico un descuento?', '¿Cómo abro la caja?', '¿Cómo proceso una devolución?'],
  '/inventory':  ['¿Qué productos están por agotarse?', '¿Cómo ingreso mercancía?', 'Muestra alertas de stock'],
  '/dian':       ['¿Cómo configuro mi resolución DIAN?', '¿Qué es el régimen simple?', '¿Cómo clasifico el IVA?'],
  '/customers':  ['¿Cómo fidelizo clientes frecuentes?', '¿Quiénes son mis mejores clientes?'],
  '/barbershop': ['¿Cómo agenda una cita?', '¿Cómo bloqueo un horario?'],
  '/workshop':   ['¿Cómo creo una orden de trabajo?', '¿Cómo registro repuestos?'],
  default:       ['¿Qué puedes hacer?', '¿Cómo funciona FERZU POS?', '¿Cómo contacto soporte?'],
}

const QUICK_QUERIES = [
  '¿Cuánto vendí esta semana?',
  '¿Cuál fue mi producto más vendido?',
  '¿Qué productos están por agotarse?',
  '¿Cómo van las sesiones de caja?',
]

function FormatText({ text }) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
        : part
    )
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return <div key={i} className="flex gap-1 mt-0.5"><span className="text-emerald-400 shrink-0 mt-0.5">•</span><span>{parts}</span></div>
    }
    if (line.trim() === '') return <div key={i} className="h-1.5" />
    return <div key={i}>{parts}</div>
  })
}

export function AIAssistant() {
  const [open, setOpen]         = useState(false)
  const [mode, setMode]         = useState('quick')   // 'quick' | 'agent'
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [hasNew, setHasNew]     = useState(false)
  const messagesEndRef           = useRef(null)
  const inputRef                 = useRef(null)
  const location                 = useLocation()
  const { user }                 = useAuth()
  const branchId                 = localStorage.getItem('ferzu_branch_id')
  const pathname                 = location.pathname
  const suggestions              = PAGE_SUGGESTIONS[pathname] || PAGE_SUGGESTIONS.default

  useEffect(() => {
    if (open && messages.length === 0) {
      const firstName = user?.full_name ? user.full_name.split(' ')[0] : null
      const page = ({ '/dashboard':'Dashboard','/pos':'POS','/inventory':'Inventario' })[pathname] || 'FERZU POS'

      if (mode === 'quick') {
        setMessages([{ role: 'assistant', content: `¡Hola${firstName ? ', ' + firstName : ''}! Tengo el reporte de los últimos 7 días listo. ¿Qué quieres saber sobre tu negocio?` }])
      } else {
        setLoading(true)
        api.post('/ai/chat', {
          message: `Saluda brevemente a${firstName ? ' ' + firstName : 'l usuario'} (está en ${page}). Luego revisa el estado actual y en máximo 3 puntos breves menciona solo lo urgente.`,
          branch_id: branchId || undefined, conversation_history: [], page_context: pathname,
        }, { timeout: 60000 })
          .then(({ data }) => setMessages([{ role: 'assistant', content: data.text }]))
          .catch(() => setMessages([{ role: 'assistant', content: `¡Hola${firstName ? ', ' + firstName : ''}! ¿En qué te ayudo?` }]))
          .finally(() => setLoading(false))
      }
    }
    if (open) { setHasNew(false); setTimeout(() => inputRef.current?.focus(), 100) }
  }, [open, mode])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const switchMode = (newMode) => {
    if (newMode === mode) return
    setMode(newMode); setMessages([]); setInput('')
  }

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
    try {
      let responseText
      if (mode === 'quick') {
        const { data } = await api.post('/ai/business-chat', {
          message: msg, branch_id: branchId || undefined, conversation_history: history,
        }, { timeout: 30000 })
        responseText = data.text
      } else {
        const { data } = await api.post('/ai/chat', {
          message: msg, branch_id: branchId || undefined, conversation_history: history, page_context: pathname,
        }, { timeout: 60000 })
        responseText = data.text
      }
      setMessages(prev => [...prev, { role: 'assistant', content: responseText }])
      if (!open) setHasNew(true)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.response?.data?.error || 'Error. Intenta de nuevo.'}` }])
    } finally { setLoading(false) }
  }, [input, loading, messages, branchId, pathname, open, mode])

  // ... [renderizado del widget — ver archivo completo en src/components/AIAssistant.jsx]
}
```

---

### `migration_courtesy.sql` — **VERSIÓN CORREGIDA** (para reemplazar el archivo local)

```sql
-- =============================================================================
-- FERZU POS — F10: Cortesías (VERSIÓN CORREGIDA — usa b.organization_id)
-- =============================================================================

-- orders: campos de cortesía
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_courtesy            BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS courtesy_authorized_by TEXT,
  ADD COLUMN IF NOT EXISTS courtesy_reason        TEXT,
  ADD COLUMN IF NOT EXISTS courtesy_amount        BIGINT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_amount             BIGINT   NOT NULL DEFAULT 0;

-- order_items: cortesía a nivel de ítem
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS is_courtesy            BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS courtesy_reason        TEXT;

-- Índice
CREATE INDEX IF NOT EXISTS idx_orders_is_courtesy ON orders(is_courtesy) WHERE is_courtesy = TRUE;

-- Vista corregida — organization_id viene de branches, NO de orders
CREATE OR REPLACE VIEW vw_courtesy_report AS
SELECT
  o.id,
  o.created_at,
  o.branch_id,
  b.name                   AS branch_name,
  o.courtesy_authorized_by,
  o.courtesy_reason,
  o.courtesy_amount,
  b.organization_id,        -- ← CORRECTO: via JOIN branches
  COUNT(oi.id)             AS item_count
FROM orders o
JOIN branches b ON b.id = o.branch_id
LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.is_courtesy = TRUE
WHERE o.is_courtesy = TRUE
  AND o.status = 'paid'
GROUP BY o.id, b.name, b.organization_id;  -- ← b.organization_id en GROUP BY
```

---

### `migration_variants.sql` — Versión adaptiva (para DB donde la tabla ya existe)

```sql
-- =============================================================================
-- FERZU POS — F9-C: Variantes (versión adaptiva — ADD COLUMN IF NOT EXISTS)
-- Usar esta versión si product_variants ya existe con otro schema
-- =============================================================================
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sku             TEXT,
  ADD COLUMN IF NOT EXISTS price           BIGINT,
  ADD COLUMN IF NOT EXISTS cost            BIGINT,
  ADD COLUMN IF NOT EXISTS attributes      JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Poblar organization_id desde el producto padre
UPDATE product_variants pv
SET organization_id = p.organization_id
FROM products p
WHERE pv.product_id = p.id AND pv.organization_id IS NULL;

-- variant_inventory
CREATE TABLE IF NOT EXISTS variant_inventory (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID    NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  branch_id  UUID    NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity   BIGINT  NOT NULL DEFAULT 0,
  UNIQUE (variant_id, branch_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pv_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_pv_org     ON product_variants(organization_id);
CREATE INDEX IF NOT EXISTS idx_vi_variant ON variant_inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_vi_branch  ON variant_inventory(branch_id);

-- RLS
ALTER TABLE product_variants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pv_org" ON product_variants;
CREATE POLICY "pv_org" ON product_variants
  FOR ALL USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "vi_org" ON variant_inventory;
CREATE POLICY "vi_org" ON variant_inventory
  FOR ALL USING (
    variant_id IN (SELECT id FROM product_variants WHERE organization_id = get_user_org_id())
  );

-- Función RPC
CREATE OR REPLACE FUNCTION decrement_variant_inventory(
  p_branch_id UUID, p_variant_id UUID, p_quantity INTEGER
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO variant_inventory (variant_id, branch_id, quantity)
  VALUES (p_variant_id, p_branch_id, -p_quantity)
  ON CONFLICT (variant_id, branch_id)
  DO UPDATE SET quantity = variant_inventory.quantity - p_quantity;
END;
$$;
```

---

## 6. Próximos Pasos para el Nuevo Claude

### Paso 1 — INMEDIATO: Corregir el archivo local y hacer commit

```bash
# 1. Corregir migration_courtesy.sql (reemplazar con la versión §5 de arriba)
# 2. Hacer commit con el skill ferzu-pos:commit
```

Mensaje de commit sugerido:  
`feat: F9-C variantes + F10 cortesías + F11 asistente IA dual-modo (Haiku/Sonnet)`

### Paso 2 — Verificar el deploy

Después del push, verificar con el skill `ferzu-pos:status`:
- Railway backend en https://ferzu-backend-production.up.railway.app/health
- Vercel frontend en https://ferzu-pos.vercel.app

### Paso 3 — Testing manual del asistente IA

1. Abrir la app → clic en el botón flotante de IA (esquina inferior derecha)
2. Probar **⚡ Consulta rápida**: "¿Cuánto vendí esta semana?" — debe responder en ~3 seg con datos reales de Supabase
3. Probar **🔧 Agente avanzado**: debe hacer el pulse proactivo al abrir

### Paso 4 — Features pendientes (no iniciadas)

Las siguientes features están planificadas pero sin implementar:
- **F12:** Notificaciones push (web push + Supabase Realtime)
- **F13:** App móvil React Native (reutilizando API existente)
- **Planes SaaS:** Pasarela de pagos (Wompi/Epayco) para activar suscripciones

### Contexto de seguridad importante

- `supabaseAdmin` (service_role key) **NUNCA** se expone al frontend — solo se usa en el backend
- RLS activo en todas las tablas vía `get_user_org_id()` — multi-tenant estricto
- La IA **nunca** escribe directamente a la DB — siempre crea un `ai_proposal` pendiente de aprobación humana
- Cumplimiento: Habeas Data (Ley 1581/2012), CONPES 4144 (disclosure IA en UI)

---

*Documento generado el 2026-08-04. Para preguntas sobre el historial completo de decisiones de arquitectura, revisar los commits del repositorio.*
