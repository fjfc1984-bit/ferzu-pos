// =============================================================================
// FERZU POS — SISTEMA DE PLANES Y FEATURE FLAGS
// Archivo: src/lib/plans.js  +  ferzu-backend/plans_config.js
// =============================================================================
// FILOSOFÍA:
//   Cada organización tiene un plan activo.
//   El plan define qué módulos tiene habilitados (enabled_modules[]).
//   ModuleGuard verifica el plan ANTES de renderizar cualquier módulo.
//   Si el módulo no está en el plan → muestra UpgradeWall.
//   EL BACKEND también valida el plan en cada ruta sensible.
// =============================================================================

// =============================================================================
// SECCIÓN 1: CATÁLOGO DE PLANES — precios y módulos incluidos
// =============================================================================

export const FERZU_PLANS = {

  // ── PLAN GRATUITO (Lead generation / prueba) ─────────────────────────────
  free: {
    id:          'free',
    name:        'FERZU Gratis',
    tagline:     'Para empezar a vender hoy',
    price_cop:   0,
    price_label: 'Gratis para siempre',
    color:       'gray',
    max_products:   50,
    max_users:       1,
    max_branches:    1,
    enabled_modules: ['pos'],    // Solo POS básico
    limitations: [
      'Sin facturación electrónica DIAN',
      'Sin IA / asistente inteligente',
      'Máx. 50 productos',
      'Sin reportes avanzados',
    ],
    cta: 'Empezar gratis',
  },

  // ── PLAN POS BÁSICO ───────────────────────────────────────────────────────
  pos_basic: {
    id:          'pos_basic',
    name:        'POS Básico',
    tagline:     'Vende, cobra y lleva el control',
    price_cop:   49_000,
    price_label: '$49.000 / mes',
    color:       'blue',
    max_products:   500,
    max_users:       3,
    max_branches:    1,
    enabled_modules: ['pos', 'inventory', 'customers', 'dashboard'],
    limitations: [
      'Sin facturación electrónica DIAN',
      'Sin módulos de nicho (barbería, taller, etc.)',
      'Sin asistente IA',
    ],
    cta: 'Comenzar POS Básico',
  },

  // ── PLAN BARBERÍA ─────────────────────────────────────────────────────────
  barbershop: {
    id:          'barbershop',
    name:        'FERZU Barbería',
    tagline:     'Todo para tu peluquería o spa',
    price_cop:   79_000,
    price_label: '$79.000 / mes',
    color:       'purple',
    max_products:   200,
    max_users:       5,
    max_branches:    1,
    enabled_modules: ['pos', 'barbershop', 'customers', 'dashboard', 'inventory'],
    limitations: [
      'Sin KDS de cocina',
      'Sin módulo de taller',
      'Sin módulo de minimarket',
    ],
    highlight: true,
    badge: '💈 Más popular en barberías',
    cta: 'Empezar con Barbería',
  },

  // ── PLAN RESTAURANTE ──────────────────────────────────────────────────────
  restaurant: {
    id:          'restaurant',
    name:        'FERZU Restaurante',
    tagline:     'Mesas, cocina y comandas en tiempo real',
    price_cop:   89_000,
    price_label: '$89.000 / mes',
    color:       'orange',
    max_products:   300,
    max_users:       8,
    max_branches:    1,
    enabled_modules: ['pos', 'kitchen', 'customers', 'dashboard', 'inventory'],
    limitations: [
      'Sin módulo de barbería',
      'Sin módulo de taller',
      'Sin minimarket',
    ],
    badge: '🍔 Ideal para restaurantes',
    cta: 'Empezar con Restaurante',
  },

  // ── PLAN TALLER ───────────────────────────────────────────────────────────
  workshop: {
    id:          'workshop',
    name:        'FERZU Taller',
    tagline:     'Órdenes de trabajo, repuestos y vehículos',
    price_cop:   79_000,
    price_label: '$79.000 / mes',
    color:       'yellow',
    max_products:   500,
    max_users:       5,
    max_branches:    1,
    enabled_modules: ['pos', 'workshop', 'inventory', 'customers', 'dashboard'],
    badge: '🔧 Diseñado para talleres',
    cta: 'Empezar con Taller',
  },

  // ── PLAN MINIMARKET ───────────────────────────────────────────────────────
  minimarket: {
    id:          'minimarket',
    name:        'FERZU Minimarket',
    tagline:     'Balanza, vencimientos y lotes',
    price_cop:   79_000,
    price_label: '$79.000 / mes',
    color:       'green',
    max_products:   2000,
    max_users:       4,
    max_branches:    1,
    enabled_modules: ['pos', 'minimarket', 'inventory', 'customers', 'dashboard', 'dian'],
    badge: '🛒 Ideal para tiendas y minimarkets',
    cta: 'Empezar con Minimarket',
  },

  // ── PLAN PRO (multi-nicho) ────────────────────────────────────────────────
  pro: {
    id:          'pro',
    name:        'FERZU Pro',
    tagline:     'Todos los módulos + IA + DIAN',
    price_cop:   149_000,
    price_label: '$149.000 / mes',
    color:       'brand',
    max_products:   10_000,
    max_users:       20,
    max_branches:    3,
    enabled_modules: ['pos', 'barbershop', 'kitchen', 'workshop', 'minimarket',
                      'inventory', 'customers', 'dashboard', 'dian', 'ai', 'reports'],
    highlight: true,
    badge: '⚡ Todo incluido',
    cta: 'Empezar Pro',
  },

  // ── PLAN ENTERPRISE (multi-sucursal) ─────────────────────────────────────
  enterprise: {
    id:          'enterprise',
    name:        'FERZU Enterprise',
    tagline:     'Multi-sucursal, API y soporte dedicado',
    price_cop:   null,
    price_label: 'Precio a medida',
    color:       'dark',
    max_products:   null,   // Ilimitado
    max_users:       null,
    max_branches:    null,
    enabled_modules: ['pos', 'barbershop', 'kitchen', 'workshop', 'minimarket',
                      'inventory', 'customers', 'dashboard', 'dian', 'ai', 'reports',
                      'api_access', 'white_label', 'multi_branch'],
    badge: '🏢 Para cadenas y franquicias',
    cta: 'Contactar ventas',
  },
};


// =============================================================================
// SECCIÓN 2: MAPA DE MÓDULOS — metadatos para la UI
// =============================================================================

export const MODULE_META = {
  pos: {
    key:         'pos',
    label:       'Punto de Venta',
    icon:        '🧾',
    route:       '/pos',
    description: 'Vende productos y servicios, cobra con múltiples métodos de pago',
    plans:       ['free', 'pos_basic', 'barbershop', 'restaurant', 'workshop', 'minimarket', 'pro', 'enterprise'],
  },
  inventory: {
    key:         'inventory',
    label:       'Inventario',
    icon:        '📦',
    route:       '/inventory',
    description: 'Gestión de productos, stock, proveedores y movimientos',
    plans:       ['pos_basic', 'barbershop', 'restaurant', 'workshop', 'minimarket', 'pro', 'enterprise'],
  },
  dashboard: {
    key:         'dashboard',
    label:       'Dashboard',
    icon:        '📊',
    route:       '/dashboard',
    description: 'Métricas, ventas, top productos y reportes del negocio',
    plans:       ['pos_basic', 'barbershop', 'restaurant', 'workshop', 'minimarket', 'pro', 'enterprise'],
  },
  customers: {
    key:         'customers',
    label:       'Clientes',
    icon:        '👥',
    route:       '/customers',
    description: 'CRM básico, historial y fidelización de clientes',
    plans:       ['pos_basic', 'barbershop', 'restaurant', 'workshop', 'minimarket', 'pro', 'enterprise'],
  },
  barbershop: {
    key:         'barbershop',
    label:       'Barbería / Citas',
    icon:        '💈',
    route:       '/barbershop',
    description: 'Agenda de citas, sala de espera en tiempo real y comisiones',
    plans:       ['barbershop', 'pro', 'enterprise'],
  },
  kitchen: {
    key:         'kitchen',
    label:       'Cocina (KDS)',
    icon:        '🍳',
    route:       '/kitchen',
    description: 'Pantalla de cocina en tiempo real con timers y estados por ítem',
    plans:       ['restaurant', 'pro', 'enterprise'],
  },
  workshop: {
    key:         'workshop',
    label:       'Taller',
    icon:        '🔧',
    route:       '/workshop',
    description: 'Órdenes de trabajo, presupuestos y historial por placa',
    plans:       ['workshop', 'pro', 'enterprise'],
  },
  minimarket: {
    key:         'minimarket',
    label:       'Minimarket',
    icon:        '🛒',
    route:       '/minimarket',
    description: 'Balanza serial, control de vencimientos y gestión de lotes',
    plans:       ['minimarket', 'pro', 'enterprise'],
  },
  dian: {
    key:         'dian',
    label:       'Facturación DIAN',
    icon:        '📋',
    route:       '/dian-config',
    description: 'Facturación electrónica, CUFE SHA-384, notas crédito',
    plans:       ['minimarket', 'pro', 'enterprise'],
  },
  ai: {
    key:         'ai',
    label:       'Asistente IA',
    icon:        '🤖',
    route:       '/ai',
    description: 'Agente Claude para análisis de facturas, reposición y marketing',
    plans:       ['pro', 'enterprise'],
  },
  reports: {
    key:         'reports',
    label:       'Reportes Avanzados',
    icon:        '📈',
    route:       '/reports',
    description: 'Reportes de ventas, márgenes, comparativos y exportación Excel',
    plans:       ['pro', 'enterprise'],
  },
  api_access: {
    key:         'api_access',
    label:       'API / Integraciones',
    icon:        '🔌',
    route:       '/api-settings',
    description: 'Acceso a la API REST para integraciones con sistemas externos',
    plans:       ['enterprise'],
  },
  multi_branch: {
    key:         'multi_branch',
    label:       'Multi-sucursal',
    icon:        '🏢',
    route:       '/branches',
    description: 'Gestión centralizada de múltiples sucursales y consolidado',
    plans:       ['enterprise'],
  },
};


// =============================================================================
// SECCIÓN 3: HELPERS — verificar acceso desde cualquier parte del código
// =============================================================================

/**
 * Verifica si una organización tiene acceso a un módulo específico.
 * Usar en: componentes React, middleware del backend, rutas de API.
 *
 * @param {string[]} enabledModules  - Array de módulos de la org (de la BD)
 * @param {string}   moduleKey       - Clave del módulo a verificar
 * @returns {boolean}
 */
export function hasModule(enabledModules, moduleKey) {
  if (!enabledModules || !Array.isArray(enabledModules)) return false;
  return enabledModules.includes(moduleKey);
}

/**
 * Obtiene los módulos ordenados para el menú lateral,
 * basado en los módulos habilitados de la organización.
 */
export function getNavModules(enabledModules) {
  const ORDER = ['pos', 'barbershop', 'kitchen', 'workshop', 'minimarket',
                 'inventory', 'customers', 'dashboard', 'dian', 'ai', 'reports'];
  return ORDER
    .filter(key => enabledModules?.includes(key))
    .map(key => MODULE_META[key])
    .filter(Boolean);
}

/**
 * Dado un plan ID, devuelve los módulos sugeridos para upgrade.
 * Se usa en UpgradeWall para mostrar qué plan desbloquea el módulo.
 */
export function getUpgradePath(currentPlanId, targetModuleKey) {
  return Object.values(FERZU_PLANS)
    .filter(plan =>
      plan.enabled_modules.includes(targetModuleKey) &&
      (plan.price_cop || 0) > (FERZU_PLANS[currentPlanId]?.price_cop || 0)
    )
    .sort((a, b) => (a.price_cop || 999_999) - (b.price_cop || 999_999))
    .slice(0, 2); // Los 2 planes más económicos que incluyen el módulo
}


// =============================================================================
// SECCIÓN 4: SQL — Tablas de suscripciones y feature flags
// Agregar a ferzu_schema.sql
// =============================================================================
/*
-- Tabla de suscripciones
CREATE TABLE IF NOT EXISTS subscriptions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id          TEXT NOT NULL DEFAULT 'free',
  status           TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','trialing','past_due','cancelled','paused')),
  trial_ends_at    TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  -- Stripe / Wompi payment reference
  external_subscription_id TEXT,
  external_customer_id      TEXT,
  -- Módulos realmente habilitados (puede diferir del plan por customización Enterprise)
  enabled_modules  TEXT[] NOT NULL DEFAULT ARRAY['pos'],
  -- Límites del plan activo (se copian al activar para evitar joins)
  max_products     INTEGER,
  max_users        INTEGER,
  max_branches     INTEGER,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Actualizar organizations para tener referencia rápida al plan
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan_id         TEXT    NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[]  NOT NULL DEFAULT ARRAY['pos'],
  ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMPTZ;

-- RLS: solo el owner puede ver la suscripción de su org
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reads_subscription" ON subscriptions
  FOR SELECT USING (organization_id = get_org_id());

-- Trigger: sincronizar enabled_modules en organizations cuando cambia subscription
CREATE OR REPLACE FUNCTION sync_org_plan()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE organizations
  SET
    plan_id         = NEW.plan_id,
    enabled_modules = NEW.enabled_modules,
    updated_at      = NOW()
  WHERE id = NEW.organization_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_org_plan
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_org_plan();

-- Función helper: verificar acceso a módulo desde SQL (uso en RLS avanzado)
CREATE OR REPLACE FUNCTION org_has_module(p_module TEXT)
RETURNS BOOLEAN AS $$
  SELECT p_module = ANY(
    SELECT unnest(enabled_modules)
    FROM organizations
    WHERE id = get_org_id()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Vista útil para el backend: estado completo de suscripción
CREATE OR REPLACE VIEW v_org_subscription AS
SELECT
  o.id               AS organization_id,
  o.business_name,
  o.plan_id,
  o.enabled_modules,
  s.status           AS subscription_status,
  s.trial_ends_at,
  s.current_period_end,
  s.max_products,
  s.max_users,
  s.max_branches,
  CASE
    WHEN s.status = 'trialing' AND s.trial_ends_at > NOW() THEN true
    WHEN s.status = 'active' THEN true
    ELSE false
  END AS is_active
FROM organizations o
LEFT JOIN subscriptions s ON s.organization_id = o.id;
*/


// =============================================================================
// SECCIÓN 5: MIDDLEWARE BACKEND — validar módulo en rutas Express
// Agregar a ferzu_backend_api.js
// =============================================================================
/*
// Middleware: verifica que la organización tiene el módulo habilitado
// Uso: app.get('/barbershop/appointments', requireModule('barbershop'), handler)

export function requireModule(moduleKey) {
  return async (req, res, next) => {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('enabled_modules, plan_id')
      .eq('id', req.organizationId)
      .single();

    if (!org || !org.enabled_modules.includes(moduleKey)) {
      return res.status(403).json({
        error: 'module_not_enabled',
        module: moduleKey,
        current_plan: org?.plan_id || 'free',
        message: `El módulo "${moduleKey}" no está incluido en tu plan actual.`,
        upgrade_url: `${process.env.FRONTEND_URL}/upgrade?module=${moduleKey}`,
      });
    }
    next();
  };
}

// Ejemplo de uso en rutas:
// app.get('/api/barbershop/appointments', requireAuth, requireModule('barbershop'), getAppointments);
// app.post('/api/ai/chat',               requireAuth, requireModule('ai'),           chatWithAI);
// app.get('/api/kitchen/orders',         requireAuth, requireModule('kitchen'),      getKitchenOrders);
*/


// =============================================================================
// SECCIÓN 6: LÓGICA DE ACTIVACIÓN DE PLAN (webhook Stripe / Wompi)
// Usar en: ferzu-backend/webhooks/stripe.js
// =============================================================================
/*
// Al recibir webhook de pago exitoso de Stripe o Wompi:
async function activatePlan(organizationId, planId) {
  const plan = FERZU_PLANS[planId];
  if (!plan) throw new Error(`Plan desconocido: ${planId}`);

  const now     = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 1);

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      organization_id:       organizationId,
      plan_id:               planId,
      status:                'active',
      enabled_modules:       plan.enabled_modules,
      max_products:          plan.max_products,
      max_users:             plan.max_users,
      max_branches:          plan.max_branches,
      current_period_start:  now.toISOString(),
      current_period_end:    endDate.toISOString(),
      updated_at:            now.toISOString(),
    }, { onConflict: 'organization_id' });

  if (error) throw error;

  // El trigger sync_org_plan actualiza organizations.enabled_modules automáticamente
  console.log(`Plan ${planId} activado para org ${organizationId}`);
}

// Iniciar trial de 14 días al registrarse:
async function startTrial(organizationId, planId = 'pro') {
  const plan    = FERZU_PLANS[planId];
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  await supabaseAdmin.from('subscriptions').upsert({
    organization_id: organizationId,
    plan_id:         planId,
    status:          'trialing',
    enabled_modules: plan.enabled_modules, // Trial con todos los módulos del plan
    trial_ends_at:   trialEnd.toISOString(),
    max_products:    plan.max_products,
    max_users:       plan.max_users,
    max_branches:    plan.max_branches,
  }, { onConflict: 'organization_id' });
}
*/
