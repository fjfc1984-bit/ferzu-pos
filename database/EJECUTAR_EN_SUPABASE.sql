-- =============================================================================
-- FERZU POS — Script consolidado de migraciones pendientes
-- Seguro para ejecutar múltiples veces (todos usan IF NOT EXISTS)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Proyecto: laimnfckldpiovgbugyr
-- Fecha: 2026-08-04
-- =============================================================================

-- ─── MIGRATION 1: Variantes de producto (F9-C) ─────────────────────────────
-- =============================================================================
-- FERZU POS — F9-C: Variantes de Producto
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

-- ── Variantes del producto ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_variants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,       -- "Rojo / Talla M"
  sku             TEXT,
  barcode         TEXT,
  price           BIGINT,                     -- NULL = hereda precio del producto base
  cost            BIGINT,
  attributes      JSONB       NOT NULL DEFAULT '{}',  -- {"color":"Rojo","talla":"M"}
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Stock por variante por sucursal ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variant_inventory (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID    NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  branch_id  UUID    NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity   BIGINT  NOT NULL DEFAULT 0,
  UNIQUE (variant_id, branch_id)
);

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pv_product    ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_pv_org        ON product_variants(organization_id);
CREATE INDEX IF NOT EXISTS idx_vi_variant    ON variant_inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_vi_branch     ON variant_inventory(branch_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE product_variants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pv_org" ON product_variants;
CREATE POLICY "pv_org" ON product_variants
  FOR ALL USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "vi_org" ON variant_inventory;
CREATE POLICY "vi_org" ON variant_inventory
  FOR ALL USING (
    variant_id IN (
      SELECT id FROM product_variants WHERE organization_id = get_user_org_id()
    )
  );

-- ── RPC: decrementar stock de variante ───────────────────────────────────────
CREATE OR REPLACE FUNCTION decrement_variant_inventory(
  p_branch_id  UUID,
  p_variant_id UUID,
  p_quantity   INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO variant_inventory (variant_id, branch_id, quantity)
  VALUES (p_variant_id, p_branch_id, -p_quantity)
  ON CONFLICT (variant_id, branch_id)
  DO UPDATE SET quantity = variant_inventory.quantity - p_quantity;
END;
$$;

-- ─── MIGRATION 2: Cortesías (F10) ─────────────────────────────────────────
-- =============================================================================
-- FERZU POS — F10: Cortesías
-- Ejecutar en Supabase SQL Editor
-- =============================================================================
-- DIFERENCIA SEMÁNTICA:
--   descuento  → reducción de precio pactada con el cliente
--   cortesía   → el establecimiento asume el costo; el cliente paga $0
--                el inventario y el costo de la venta quedan registrados
-- =============================================================================

-- ── orders: campos de cortesía ────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_courtesy            BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS courtesy_authorized_by TEXT,      -- "Dueño", "Gerente", "Ana Pérez"
  ADD COLUMN IF NOT EXISTS courtesy_reason        TEXT,      -- "Cliente VIP", "Error en cocina"
  ADD COLUMN IF NOT EXISTS courtesy_amount        BIGINT   NOT NULL DEFAULT 0;
  -- courtesy_amount = valor real de la orden antes de zerear (para reportes de costo)

-- ── order_items: cortesía a nivel de ítem ─────────────────────────────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS is_courtesy            BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS courtesy_reason        TEXT;

-- ── Índice para reportes de cortesías ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_is_courtesy ON orders(is_courtesy) WHERE is_courtesy = TRUE;

-- ── Propinas: verificar que la columna tip_amount existe (F1) ─────────────────
-- Si por algún motivo no existe en tu DB, corre esto:
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tip_amount BIGINT NOT NULL DEFAULT 0;

-- ── Vista auxiliar para reportes de cortesías ─────────────────────────────────
CREATE OR REPLACE VIEW vw_courtesy_report AS
SELECT
  o.id,
  o.created_at,
  o.branch_id,
  b.name                   AS branch_name,
  o.courtesy_authorized_by,
  o.courtesy_reason,
  o.courtesy_amount,
  b.organization_id,        -- ← CORRECTO: via JOIN branches, NO de orders
  COUNT(oi.id)             AS item_count
FROM orders o
JOIN branches b  ON b.id = o.branch_id
LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.is_courtesy = TRUE
WHERE o.is_courtesy = TRUE
  AND o.status = 'paid'
GROUP BY o.id, b.name, b.organization_id;

-- ─── MIGRATION 3: Fidelización ────────────────────────────────────────────
-- =============================================================================
-- FERZU POS — F9-A: Programa de Fidelización
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

-- ── Configuración de fidelización por organización ────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_settings (
  organization_id  UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
  points_per_100cop INTEGER    NOT NULL DEFAULT 1,   -- 1 punto por cada $100 COP
  point_value_cop   INTEGER    NOT NULL DEFAULT 10,  -- 1 punto = $10 COP de descuento
  min_redeem_points INTEGER    NOT NULL DEFAULT 100, -- mínimo para canjear
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Cuentas de fidelización por cliente ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id     UUID        NOT NULL REFERENCES customers(id)     ON DELETE CASCADE,
  balance         INTEGER     NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned    INTEGER     NOT NULL DEFAULT 0,
  total_redeemed  INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, customer_id)
);

-- ── Movimientos (log inmutable) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  order_id      UUID        REFERENCES orders(id),
  type          TEXT        NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
  points        INTEGER     NOT NULL,           -- positivo=earn, negativo=redeem/expire
  balance_after INTEGER     NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_customer ON loyalty_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_org      ON loyalty_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_account        ON loyalty_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_order          ON loyalty_transactions(order_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE loyalty_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- Settings: solo la propia org
DROP POLICY IF EXISTS "loyalty_settings_org" ON loyalty_settings;
CREATE POLICY "loyalty_settings_org" ON loyalty_settings
  FOR ALL USING (organization_id = get_user_org_id());

-- Accounts: solo la propia org
DROP POLICY IF EXISTS "loyalty_accounts_org" ON loyalty_accounts;
CREATE POLICY "loyalty_accounts_org" ON loyalty_accounts
  FOR ALL USING (organization_id = get_user_org_id());

-- Transactions: solo las de cuentas de la propia org
DROP POLICY IF EXISTS "loyalty_tx_org" ON loyalty_transactions;
CREATE POLICY "loyalty_tx_org" ON loyalty_transactions
  FOR ALL USING (
    account_id IN (
      SELECT id FROM loyalty_accounts WHERE organization_id = get_user_org_id()
    )
  );

-- ── RPC: acumular puntos (atómico, llamado desde backend con service role) ────
CREATE OR REPLACE FUNCTION earn_loyalty_points(
  p_organization_id UUID,
  p_customer_id     UUID,
  p_order_id        UUID,
  p_points          INTEGER,
  p_notes           TEXT DEFAULT NULL
)
RETURNS INTEGER  -- balance_after
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_account_id    UUID;
  v_balance_after INTEGER;
BEGIN
  -- Upsert de la cuenta
  INSERT INTO loyalty_accounts (organization_id, customer_id, balance, total_earned)
  VALUES (p_organization_id, p_customer_id, p_points, p_points)
  ON CONFLICT (organization_id, customer_id)
  DO UPDATE SET
    balance       = loyalty_accounts.balance       + p_points,
    total_earned  = loyalty_accounts.total_earned  + p_points,
    updated_at    = NOW()
  RETURNING id, balance INTO v_account_id, v_balance_after;

  -- Log del movimiento
  INSERT INTO loyalty_transactions (account_id, order_id, type, points, balance_after, notes)
  VALUES (v_account_id, p_order_id, 'earn', p_points, v_balance_after, p_notes);

  RETURN v_balance_after;
END;
$$;

-- ── RPC: canjear puntos (atómico, valida balance) ────────────────────────────
CREATE OR REPLACE FUNCTION redeem_loyalty_points(
  p_organization_id UUID,
  p_customer_id     UUID,
  p_order_id        UUID,
  p_points          INTEGER,
  p_notes           TEXT DEFAULT NULL
)
RETURNS INTEGER  -- balance_after (-1 si saldo insuficiente)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_account_id    UUID;
  v_current_bal   INTEGER;
  v_balance_after INTEGER;
BEGIN
  SELECT id, balance INTO v_account_id, v_current_bal
  FROM loyalty_accounts
  WHERE organization_id = p_organization_id AND customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND OR v_current_bal < p_points THEN
    RETURN -1;  -- saldo insuficiente
  END IF;

  v_balance_after := v_current_bal - p_points;

  UPDATE loyalty_accounts SET
    balance        = v_balance_after,
    total_redeemed = total_redeemed + p_points,
    updated_at     = NOW()
  WHERE id = v_account_id;

  INSERT INTO loyalty_transactions (account_id, order_id, type, points, balance_after, notes)
  VALUES (v_account_id, p_order_id, 'redeem', -p_points, v_balance_after, p_notes);

  RETURN v_balance_after;
END;
$$;

-- ─── MIGRATION 4: Turnos (F12) ────────────────────────────────────────────
-- =============================================================================
-- FERZU POS — Migración: Módulo de Turnos y Asistencia (F3)
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS shifts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Tiempos
  clock_in        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out       TIMESTAMPTZ,
  break_start     TIMESTAMPTZ,
  break_end       TIMESTAMPTZ,
  -- Totales calculados al hacer clock-out
  total_minutes   INTEGER,        -- minutos trabajados (excluye descanso)
  break_minutes   INTEGER,        -- minutos de descanso
  -- Metadata
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS shifts_branch_date  ON shifts(branch_id, clock_in);
CREATE INDEX IF NOT EXISTS shifts_user_date    ON shifts(user_id, clock_in);
CREATE INDEX IF NOT EXISTS shifts_org          ON shifts(organization_id);
CREATE INDEX IF NOT EXISTS shifts_active       ON shifts(user_id) WHERE clock_out IS NULL;

-- RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_org_isolation" ON shifts
  FOR ALL
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_shifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_updated_at ON shifts;
CREATE TRIGGER shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_shifts_updated_at();

-- ─── MIGRATION 5: RLS fix user_branches ───────────────────────────────────
-- ============================================================
-- FIX: RLS policy para user_branches
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- Permitir que cada usuario lea sus propias filas en user_branches
CREATE POLICY IF NOT EXISTS "user_branches_select_own"
  ON user_branches
  FOR SELECT
  USING (user_id = auth.uid());

-- Permitir que el owner de la org lea todas las filas de sus sucursales
CREATE POLICY IF NOT EXISTS "user_branches_select_org_owner"
  ON user_branches
  FOR SELECT
  USING (
    branch_id IN (
      SELECT b.id FROM branches b
      JOIN users u ON u.organization_id = b.organization_id
      WHERE u.id = auth.uid() AND u.role = 'owner'
    )
  );

-- ─── MIGRATION 6: RLS Audit 007 (10 tablas) ──────────────────────────────
-- =============================================================================
-- FERZU POS — Migration 007: RLS Audit Fix
-- Fecha: 2026-08-03
-- Seguro para ejecutar múltiples veces (usa IF NOT EXISTS / DROP POLICY IF EXISTS)
--
-- HALLAZGOS DEL AUDIT:
--   1. sync_queue      → RLS no habilitada, sin policies (CRÍTICO)
--   2. dian_configs    → Sin RLS ni policies (datos fiscales DIAN sensibles)
--   3. payments        → Sin RLS ni policies (registros de pago)
--   4. system_alerts   → Policy usa JWT claims inexistentes → siempre FALSE
--   5. user_branches   → ENABLE ROW LEVEL SECURITY faltante + sin policies de escritura
--   6. suppliers       → Sin RLS ni policies
--   7. audit_log       → Sin RLS ni policies (log de auditoría visible entre orgs)
--   8. ai_proposals    → Sin RLS ni policies
--   9. tables          → Sin RLS ni policies (mesas de restaurante)
--  10. appointments    → Sin RLS ni policies (citas)
-- =============================================================================

-- ── HELPER: confirmar que get_user_org_id() existe ──────────────────────────
-- (ya debe existir de 004_rls_policies.sql — solo se recrea si falta)
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;


-- =============================================================================
-- 1. sync_queue — CRÍTICO: contiene payloads offline de todas las orgs
-- Acceso exclusivo al service role (backend). Ningún cliente puede leer.
-- =============================================================================
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_queue_service_only" ON sync_queue;
CREATE POLICY "sync_queue_service_only" ON sync_queue
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- =============================================================================
-- 2. dian_configs — datos fiscales DIAN (resolución, prefijos, secuencias)
-- Solo el backend los lee/escribe vía service role.
-- =============================================================================
ALTER TABLE dian_configs ENABLE ROW LEVEL SECURITY;

-- El comerciante puede leer su propia configuración DIAN
DROP POLICY IF EXISTS "dian_configs_select_own_org" ON dian_configs;
CREATE POLICY "dian_configs_select_own_org" ON dian_configs
  FOR SELECT
  USING (organization_id = get_user_org_id());

-- Escritura SOLO por service role (backend)
-- No se necesita política de INSERT/UPDATE/DELETE — el service role bypassa RLS.


-- =============================================================================
-- 3. payments — registros de pago vinculados a órdenes
-- =============================================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_own_org" ON payments;
CREATE POLICY "payments_select_own_org" ON payments
  FOR SELECT
  USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN branches b ON o.branch_id = b.id
      WHERE b.organization_id = get_user_org_id()
    )
  );

-- INSERT/UPDATE solo por service role (backend)


-- =============================================================================
-- 4. system_alerts — FIX: policy anterior usaba JWT claims que Supabase no incluye
-- El campo organization_id del JWT no existe → la policy siempre devolvía FALSE.
-- =============================================================================
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

-- Eliminar policy rota
DROP POLICY IF EXISTS "org_isolation"            ON system_alerts;
DROP POLICY IF EXISTS "system_alerts_own_org"    ON system_alerts;

-- Policy correcta usando get_user_org_id() (igual que todas las demás tablas)
CREATE POLICY "system_alerts_own_org" ON system_alerts
  FOR SELECT
  USING (organization_id = get_user_org_id());

-- Escritura solo por service role


-- =============================================================================
-- 5. user_branches — tabla de acceso usuario↔sucursal
-- ENABLE RLS faltaba; solo había un fix parcial en fix_user_branches_rls.sql
-- =============================================================================
ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve sus propias filas
DROP POLICY IF EXISTS "user_branches_select_own"      ON user_branches;
CREATE POLICY "user_branches_select_own" ON user_branches
  FOR SELECT
  USING (user_id = auth.uid());

-- El owner/admin de la org ve todas las filas de su org
DROP POLICY IF EXISTS "user_branches_select_org_mgr"  ON user_branches;
CREATE POLICY "user_branches_select_org_mgr" ON user_branches
  FOR SELECT
  USING (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );

-- INSERT/UPDATE/DELETE solo por service role (el backend gestiona asignaciones)


-- =============================================================================
-- 6. suppliers — proveedores por organización
-- =============================================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_own_org" ON suppliers;
CREATE POLICY "suppliers_own_org" ON suppliers
  FOR ALL
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());


-- =============================================================================
-- 7. audit_log — log de auditoría (no debe cruzarse entre orgs)
-- Solo lectura del service role — el cliente no accede directamente.
-- =============================================================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_service_only" ON audit_log;
CREATE POLICY "audit_log_service_only" ON audit_log
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- =============================================================================
-- 8. ai_proposals — propuestas de IA por organización
-- =============================================================================
ALTER TABLE ai_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_proposals_own_org" ON ai_proposals;
CREATE POLICY "ai_proposals_own_org" ON ai_proposals
  FOR ALL
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());


-- =============================================================================
-- 9. tables — mesas de restaurante por sucursal
-- =============================================================================
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tables_own_org" ON tables;
CREATE POLICY "tables_own_org" ON tables
  FOR ALL
  USING (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  )
  WITH CHECK (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );


-- =============================================================================
-- 10. appointments — citas por sucursal
-- =============================================================================
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_own_org" ON appointments;
CREATE POLICY "appointments_own_org" ON appointments
  FOR ALL
  USING (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  )
  WITH CHECK (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );


-- =============================================================================
-- VERIFICACIÓN
-- Ejecutar después para confirmar que todas las policies están activas:
-- =============================================================================
/*
SELECT
  tablename,
  COUNT(*) AS num_policies,
  ARRAY_AGG(policyname ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'sync_queue', 'dian_configs', 'payments', 'system_alerts',
    'user_branches', 'suppliers', 'audit_log', 'ai_proposals',
    'tables', 'appointments'
  )
GROUP BY tablename
ORDER BY tablename;

-- Resultado esperado: 10 filas, una por tabla.
-- sync_queue, audit_log → 1 policy cada una (service_only / USING false)
-- Resto → 1-2 policies con lógica de org
*/
