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
