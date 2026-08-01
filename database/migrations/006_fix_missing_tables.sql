-- =============================================================================
-- FERZU POS — Migration 006: Tablas faltantes + correcciones de esquema
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Generado automáticamente por auditoría profunda de codebase
-- =============================================================================

-- ── 1. CORREGIR plan_id DEFAULT: 'starter' no existe en FERZU_PLANS ───────────
-- El código usa 'free' como plan inicial. 'starter' rompe ModuleGuard.
ALTER TABLE organizations
  ALTER COLUMN plan_id SET DEFAULT 'free';

-- Corregir registros ya creados con 'starter' (si los hay)
UPDATE organizations
  SET plan_id = 'free'
  WHERE plan_id = 'starter';

-- ── 2. COLUMNA active_modules (si no se ejecutó migration_active_modules.sql) ──
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS active_modules JSONB DEFAULT '{}'::jsonb;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '{}'::jsonb;

-- ── 3. TABLA subscriptions ────────────────────────────────────────────────────
-- Referenciada en payments.routes.js → webhook Bold hace upsert aquí.
-- Sin esta tabla, cada pago aprobado falla con error 500.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id               TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 month',
  bold_transaction_id   TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT subscriptions_org_unique UNIQUE (organization_id)
);

-- Índice para lookups rápidos por organización
CREATE INDEX IF NOT EXISTS idx_subscriptions_organization_id
  ON subscriptions (organization_id);

-- RLS: el comerciante solo ve su propia suscripción
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_own_org" ON subscriptions;
CREATE POLICY "subscriptions_own_org" ON subscriptions
  FOR SELECT USING (organization_id = get_user_org_id());
-- Solo el service role (backend) puede insertar/actualizar — bypassa RLS automáticamente

-- ── 4. TABLA payment_orders ───────────────────────────────────────────────────
-- Registro de órdenes de pago Bold. Permite auditar pagos y evitar duplicados.

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id           TEXT        NOT NULL,
  amount_cop        INTEGER     NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  bold_order_id     TEXT        UNIQUE,
  bold_txn_id       TEXT,
  metadata          JSONB       DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para lookups por organización
CREATE INDEX IF NOT EXISTS idx_payment_orders_organization_id
  ON payment_orders (organization_id);

-- RLS
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_orders_own_org" ON payment_orders;
CREATE POLICY "payment_orders_own_org" ON payment_orders
  FOR SELECT USING (organization_id = get_user_org_id());

-- ── 5. TRIGGER: actualizar updated_at automáticamente ────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_payment_orders_updated_at ON payment_orders;
CREATE TRIGGER trg_payment_orders_updated_at
  BEFORE UPDATE ON payment_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── VERIFICACIÓN ──────────────────────────────────────────────────────────────
-- Ejecutar esto para confirmar que todo está OK:
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('subscriptions', 'payment_orders');
--
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'organizations'
--   AND column_name IN ('plan_id', 'active_modules', 'enabled_modules');
