-- ============================================================
-- FERZU POS — Schema v2 (corregido para coincidir con el código)
-- Ejecutar en Supabase → SQL Editor → New Query → Run
-- ============================================================

-- ── Extensiones ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUMs ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE business_type AS ENUM ('restaurant','minimarket','barbershop','workshop','generic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM ('synced','pending_sync','conflict');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ai_proposal_status AS ENUM ('pending','approved','rejected','executed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Datos básicos (nombres que usa el código)
  business_name         VARCHAR(255) NOT NULL,
  legal_name            VARCHAR(255),
  nit                   VARCHAR(30),
  phone                 VARCHAR(30),
  email                 VARCHAR(255),
  business_type         business_type NOT NULL DEFAULT 'generic',
  -- Onboarding
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Plan SaaS (usado por ModuleGuard)
  plan_id               VARCHAR(30) DEFAULT 'starter',  -- 'starter' | 'pro' | 'enterprise'
  enabled_modules       JSONB DEFAULT '["dashboard","pos","inventory","customers"]',
  trial_ends_at         TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  plan_expires_at       TIMESTAMPTZ,
  -- Colombia fiscal
  tax_regime            VARCHAR(30) DEFAULT 'simplified',
  is_vat_responsible    BOOLEAN DEFAULT FALSE,
  -- Estado
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. BRANCHES (sucursales)
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  address           TEXT,
  city              VARCHAR(100),
  department        VARCHAR(100),
  phone             VARCHAR(30),
  is_main           BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. USERS (espejo público de auth.users)
-- organization_id es nullable al inicio (se asigna en onboarding)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY,  -- mismo UUID que auth.users.id
  organization_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
  email             VARCHAR(255) NOT NULL UNIQUE,
  full_name         VARCHAR(255) NOT NULL DEFAULT '',
  role              VARCHAR(30) NOT NULL DEFAULT 'owner',
  pin_hash          TEXT,              -- bcrypt del PIN de cajero
  avatar_url        TEXT,
  commission_pct    DECIMAL(5,2) DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. USER_BRANCHES (relación usuario ↔ sucursal)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_branches (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  role              VARCHAR(30) DEFAULT 'owner',
  is_default        BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_id, branch_id)
);

-- ============================================================
-- 5. CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES categories(id),
  name              VARCHAR(255) NOT NULL,
  color             CHAR(7),
  icon              VARCHAR(50),
  sort_order        INTEGER DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id       UUID REFERENCES categories(id),
  name              VARCHAR(255) NOT NULL,
  sku               VARCHAR(100),
  barcode           VARCHAR(100),
  description       TEXT,
  image_url         TEXT,
  item_type         VARCHAR(20) NOT NULL DEFAULT 'product',
  price             BIGINT NOT NULL DEFAULT 0,
  cost              BIGINT DEFAULT 0,
  vat_rate          DECIMAL(5,2) DEFAULT 0,
  vat_included      BOOLEAN DEFAULT TRUE,
  track_inventory   BOOLEAN DEFAULT TRUE,
  unit_of_measure   VARCHAR(20) DEFAULT 'unit',
  min_stock         DECIMAL(10,3) DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  is_featured       BOOLEAN DEFAULT FALSE,
  sort_order        INTEGER DEFAULT 0,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity          DECIMAL(10,3) NOT NULL DEFAULT 0,
  reserved_qty      DECIMAL(10,3) DEFAULT 0,
  min_stock         DECIMAL(10,3) DEFAULT 0,
  last_cost         BIGINT DEFAULT 0,
  average_cost      BIGINT DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, product_id)
);

-- ============================================================
-- 8. SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  nit               VARCHAR(30),
  contact_name      VARCHAR(255),
  email             VARCHAR(255),
  phone             VARCHAR(30),
  whatsapp          VARCHAR(30),
  payment_terms_days INTEGER DEFAULT 30,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name        VARCHAR(100),
  last_name         VARCHAR(100),
  email             VARCHAR(255),
  phone             VARCHAR(30),
  whatsapp          VARCHAR(30),
  document_type     VARCHAR(10) DEFAULT 'CC',
  document_number   VARCHAR(30),
  birth_date        DATE,
  address           TEXT,
  city              VARCHAR(100),
  segment           VARCHAR(30) DEFAULT 'regular',
  loyalty_points    INTEGER DEFAULT 0,
  total_spent       BIGINT DEFAULT 0,
  visit_count       INTEGER DEFAULT 0,
  last_visit_at     TIMESTAMPTZ,
  accepts_marketing BOOLEAN DEFAULT TRUE,
  notes             TEXT,
  requires_invoice  BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. TABLES (mesas para restaurante)
-- ============================================================
CREATE TABLE IF NOT EXISTS tables (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name              VARCHAR(50) NOT NULL,
  capacity          INTEGER DEFAULT 4,
  area              VARCHAR(50),
  status            VARCHAR(20) DEFAULT 'available',
  position_x        INTEGER DEFAULT 0,
  position_y        INTEGER DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- 11. APPOINTMENTS (citas para barbería/taller)
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  customer_id       UUID REFERENCES customers(id),
  staff_user_id     UUID REFERENCES users(id),
  table_id          UUID REFERENCES tables(id),
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  status            VARCHAR(20) DEFAULT 'scheduled',
  services          JSONB DEFAULT '[]',
  notes             TEXT,
  reminder_sent_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 12. CASH SESSIONS (sesiones de caja)
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  opened_at         TIMESTAMPTZ DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  opening_cash      BIGINT DEFAULT 0,
  total_sales       BIGINT DEFAULT 0,
  total_cash        BIGINT DEFAULT 0,
  total_card        BIGINT DEFAULT 0,
  total_nequi       BIGINT DEFAULT 0,
  total_daviplata   BIGINT DEFAULT 0,
  total_transfers   BIGINT DEFAULT 0,
  total_discounts   BIGINT DEFAULT 0,
  total_refunds     BIGINT DEFAULT 0,
  closing_cash      BIGINT DEFAULT 0,
  cash_difference   BIGINT DEFAULT 0,
  notes             TEXT,
  status            VARCHAR(20) DEFAULT 'open'
);

-- ============================================================
-- 13. ORDERS (ventas / pedidos)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  cash_session_id   UUID REFERENCES cash_sessions(id),
  order_number      VARCHAR(50) NOT NULL,
  order_type        VARCHAR(20) NOT NULL DEFAULT 'sale',
  status            VARCHAR(20) NOT NULL DEFAULT 'open',
  customer_id       UUID REFERENCES customers(id),
  staff_user_id     UUID REFERENCES users(id),
  table_id          UUID REFERENCES tables(id),
  appointment_id    UUID REFERENCES appointments(id),
  subtotal          BIGINT NOT NULL DEFAULT 0,
  discount_amount   BIGINT DEFAULT 0,
  tax_total         BIGINT DEFAULT 0,
  tip_amount        BIGINT DEFAULT 0,
  total             BIGINT NOT NULL DEFAULT 0,
  discount_type     VARCHAR(20),
  discount_value    DECIMAL(10,2),
  discount_reason   TEXT,
  sync_status       sync_status DEFAULT 'synced',
  local_id          VARCHAR(100),
  metadata          JSONB DEFAULT '{}',
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 14. ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES products(id),
  product_name      VARCHAR(255) NOT NULL,
  product_sku       VARCHAR(100),
  quantity          DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit_price        BIGINT NOT NULL,
  unit_cost         BIGINT DEFAULT 0,
  vat_rate          DECIMAL(5,2) DEFAULT 0,
  vat_amount        BIGINT DEFAULT 0,
  discount_amount   BIGINT DEFAULT 0,
  subtotal          BIGINT NOT NULL,
  modifiers         JSONB DEFAULT '[]',
  notes             TEXT,
  staff_user_id     UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 15. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method    VARCHAR(30) NOT NULL,
  amount            BIGINT NOT NULL,
  cash_received     BIGINT,
  cash_change       BIGINT,
  transaction_ref   VARCHAR(100),
  gateway           VARCHAR(30),
  gateway_status    VARCHAR(30),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 16. DIAN CONFIGS (facturación electrónica)
-- ============================================================
CREATE TABLE IF NOT EXISTS dian_configs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id           UUID REFERENCES branches(id),
  resolution_number   VARCHAR(50),
  prefix              VARCHAR(10),
  from_number         INTEGER,
  to_number           INTEGER,
  current_number      INTEGER DEFAULT 1,
  resolution_date     DATE,
  pta_provider        VARCHAR(50),   -- proveedor tecnológico DIAN
  environment         VARCHAR(20) DEFAULT 'test',
  is_active           BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 17. AI PROPOSALS (human-in-the-loop)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  branch_id         UUID REFERENCES branches(id),
  proposal_type     VARCHAR(50) NOT NULL,
  title             VARCHAR(255) NOT NULL,
  description       TEXT NOT NULL,
  payload           JSONB NOT NULL,
  confidence_score  INTEGER,
  status            ai_proposal_status DEFAULT 'pending',
  source_type       VARCHAR(30),
  source_id         UUID,
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  expires_at        TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 18. AI CHAT HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_chat_history (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID REFERENCES users(id),
  session_id        VARCHAR(100),
  role              VARCHAR(10) NOT NULL,
  content           TEXT NOT NULL,
  proposal_id       UUID REFERENCES ai_proposals(id),
  model             VARCHAR(50),
  tokens_used       INTEGER,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 19. AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID REFERENCES users(id),
  action            VARCHAR(50) NOT NULL,
  table_name        VARCHAR(100),
  record_id         UUID,
  old_values        JSONB,
  new_values        JSONB,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 20. SYSTEM ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS system_alerts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  branch_id         UUID REFERENCES branches(id),
  alert_type        VARCHAR(50) NOT NULL,
  severity          VARCHAR(10) DEFAULT 'medium',
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  data              JSONB,
  is_read           BOOLEAN DEFAULT FALSE,
  is_resolved       BOOLEAN DEFAULT FALSE,
  resolved_by       UUID REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES CRÍTICOS
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_branches_org         ON branches(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org         ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode     ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_branch     ON inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product    ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch        ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_date          ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order       ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_customers_org        ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone      ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_proposals_org     ON ai_proposals(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_proposals_status  ON ai_proposals(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_org        ON audit_log(organization_id);

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_orgs_updated_at     BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_orders_updated_at   BEFORE UPDATE ON orders        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TRIGGER CRÍTICO: Auto-crear public.users desde auth.users
-- Cuando alguien se registra con Supabase Auth, se crea la fila
-- en public.users automáticamente.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'owner',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ============================================================
-- FUNCIÓN: Generar número de orden
-- ============================================================
CREATE OR REPLACE FUNCTION generate_order_number(p_branch_id UUID)
RETURNS VARCHAR AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count FROM orders WHERE branch_id = p_branch_id;
  RETURN 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(v_count::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: Alerta stock bajo
-- ============================================================
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_product products%ROWTYPE;
  v_org_id  UUID;
BEGIN
  SELECT * INTO v_product FROM products WHERE id = NEW.product_id;
  SELECT organization_id INTO v_org_id FROM branches WHERE id = NEW.branch_id;
  IF NEW.quantity <= NEW.min_stock AND v_product.track_inventory = TRUE AND NEW.min_stock > 0 THEN
    INSERT INTO system_alerts (organization_id, branch_id, alert_type, severity, title, description, data)
    VALUES (
      v_org_id, NEW.branch_id, 'low_stock',
      CASE WHEN NEW.quantity = 0 THEN 'critical' ELSE 'high' END,
      'Stock bajo: ' || v_product.name,
      'Quedan ' || NEW.quantity || ' unidades (mínimo: ' || NEW.min_stock || ')',
      jsonb_build_object('product_id', NEW.product_id, 'current_qty', NEW.quantity, 'min_stock', NEW.min_stock)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_low_stock AFTER UPDATE OF quantity ON inventory
    FOR EACH ROW EXECUTE FUNCTION check_low_stock();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TRIGGER: Actualizar estadísticas de cliente al pagar
-- ============================================================
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.customer_id IS NOT NULL THEN
    UPDATE customers SET
      total_spent  = total_spent + NEW.total,
      visit_count  = visit_count + 1,
      last_visit_at = NOW(),
      segment = CASE
        WHEN total_spent + NEW.total >= 1000000 THEN 'vip'
        WHEN total_spent + NEW.total >= 200000  THEN 'regular'
        ELSE segment END,
      updated_at = NOW()
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_customer_stats AFTER UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_customer_stats();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- RLS — Row Level Security (aislamiento multi-tenant)
-- ============================================================
ALTER TABLE organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_proposals   ENABLE ROW LEVEL SECURITY;

-- Políticas: cada usuario ve solo su organización
-- (el service_role del backend bypasa RLS automáticamente)

DROP POLICY IF EXISTS "users_own_row" ON users;
CREATE POLICY "users_own_row" ON users
  FOR ALL USING (id = auth.uid());

DROP POLICY IF EXISTS "org_own" ON organizations;
CREATE POLICY "org_own" ON organizations
  FOR ALL USING (
    id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "branches_org" ON branches;
CREATE POLICY "branches_org" ON branches
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "products_org" ON products;
CREATE POLICY "products_org" ON products
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "inventory_branch" ON inventory;
CREATE POLICY "inventory_branch" ON inventory
  FOR ALL USING (
    branch_id IN (
      SELECT b.id FROM branches b
      JOIN users u ON u.organization_id = b.organization_id
      WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "customers_org" ON customers;
CREATE POLICY "customers_org" ON customers
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "orders_branch" ON orders;
CREATE POLICY "orders_branch" ON orders
  FOR ALL USING (
    branch_id IN (
      SELECT b.id FROM branches b
      JOIN users u ON u.organization_id = b.organization_id
      WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "order_items_order" ON order_items;
CREATE POLICY "order_items_order" ON order_items
  FOR ALL USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN branches b ON b.id = o.branch_id
      JOIN users u ON u.organization_id = b.organization_id
      WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "payments_order" ON payments;
CREATE POLICY "payments_order" ON payments
  FOR ALL USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN branches b ON b.id = o.branch_id
      JOIN users u ON u.organization_id = b.organization_id
      WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_proposals_org" ON ai_proposals;
CREATE POLICY "ai_proposals_org" ON ai_proposals
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  );

-- ============================================================
-- FIN DEL SCHEMA v2
-- ============================================================
