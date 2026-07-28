-- =============================================================================
-- FERZU POS — MIGRATION V3
-- Ejecutar completo en Supabase → SQL Editor → New query → Run
-- Fecha: 2026-07-27
-- Seguro para ejecutar múltiples veces (usa IF NOT EXISTS / OR REPLACE)
-- =============================================================================

-- ── 1. COLUMNA NUEVA: branches.city_code (código DIVIPOLA para DIAN) ─────────
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS city_code VARCHAR(8);

COMMENT ON COLUMN branches.city_code IS
  'Código DIVIPOLA DANE del municipio. Ej: 11001=Bogotá, 05001=Medellín, 76001=Cali. '
  'Ver: https://www.dane.gov.co/index.php/estadisticas-por-tema/demografia-y-poblacion/divipola-codigos-municipios';

-- ── 2. VISTA: v_daily_sales ──────────────────────────────────────────────────
-- Ventas por sucursal por día. Usada en /reports/dashboard
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  o.branch_id,
  DATE(o.created_at AT TIME ZONE 'America/Bogota')   AS sale_date,
  COUNT(*)                                            AS total_orders,
  COALESCE(SUM(o.total), 0)                          AS total_revenue,
  COALESCE(SUM(o.discount_amount), 0)                AS total_discounts,
  COALESCE(SUM(o.tax_total), 0)                      AS total_tax,
  COALESCE(ROUND(AVG(o.total))::BIGINT, 0)           AS avg_ticket,
  COUNT(DISTINCT o.customer_id)                       AS unique_customers,
  COUNT(DISTINCT o.cash_session_id)                   AS sessions_count
FROM orders o
WHERE o.status = 'paid'
GROUP BY o.branch_id, DATE(o.created_at AT TIME ZONE 'America/Bogota');

-- ── 3. VISTA: v_product_profitability (con organization_id para multi-tenant) ─
-- Top productos por ingresos y margen. Filtrada por organization_id (seguridad).
CREATE OR REPLACE VIEW v_product_profitability AS
SELECT
  p.organization_id,
  oi.product_id,
  oi.product_name,
  oi.product_sku,
  o.branch_id,
  SUM(oi.quantity)                                            AS total_units_sold,
  COALESCE(SUM(oi.subtotal + COALESCE(oi.vat_amount, 0)), 0)  AS total_revenue,
  COALESCE(SUM(COALESCE(oi.unit_cost, 0) * oi.quantity), 0)   AS total_cost,
  COALESCE(SUM(oi.subtotal + COALESCE(oi.vat_amount, 0)
    - COALESCE(oi.unit_cost, 0) * oi.quantity), 0)            AS total_profit,
  CASE
    WHEN SUM(oi.subtotal + COALESCE(oi.vat_amount, 0)) > 0
    THEN ROUND(
      SUM(oi.subtotal + COALESCE(oi.vat_amount, 0)
        - COALESCE(oi.unit_cost, 0) * oi.quantity) * 100.0
      / SUM(oi.subtotal + COALESCE(oi.vat_amount, 0)), 1)
    ELSE 0
  END                                                         AS profit_margin_pct
FROM order_items oi
JOIN orders   o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.status = 'paid'
GROUP BY p.organization_id, oi.product_id, oi.product_name, oi.product_sku, o.branch_id;

-- ── 4. VISTA: v_inventory_status ─────────────────────────────────────────────
-- Estado actual del inventario por sucursal. Usada en /inventory
CREATE OR REPLACE VIEW v_inventory_status AS
SELECT
  i.branch_id,
  p.id                                             AS product_id,
  p.name                                           AS product_name,
  p.sku,
  p.barcode,
  p.image_url,
  i.quantity                                       AS current_stock,
  p.min_stock,
  CASE
    WHEN i.quantity IS NULL OR i.quantity = 0  THEN 'out_of_stock'
    WHEN i.quantity <= COALESCE(p.min_stock, 0) THEN 'low_stock'
    ELSE 'ok'
  END                                              AS stock_status,
  p.unit_of_measure,
  p.price,
  COALESCE(i.average_cost, p.cost, 0)             AS average_cost,
  (i.quantity * p.price)                           AS stock_value,
  c.name                                           AS category_name,
  c.color                                          AS category_color
FROM inventory i
JOIN products   p ON p.id  = i.product_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.is_active = TRUE
  AND p.track_inventory = TRUE;

-- ── 5. VISTA: v_weekly_sales ─────────────────────────────────────────────────
-- Tendencia semanal de ventas. Para gráfico de tendencias en dashboard.
CREATE OR REPLACE VIEW v_weekly_sales AS
SELECT
  o.branch_id,
  DATE_TRUNC('week', o.created_at AT TIME ZONE 'America/Bogota') AS week_start,
  COUNT(*)                                            AS total_orders,
  COALESCE(SUM(o.total), 0)                          AS total_revenue,
  COALESCE(ROUND(AVG(o.total))::BIGINT, 0)           AS avg_ticket,
  COUNT(DISTINCT o.customer_id)                       AS unique_customers
FROM orders o
WHERE o.status = 'paid'
GROUP BY o.branch_id, DATE_TRUNC('week', o.created_at AT TIME ZONE 'America/Bogota');

-- ── 6. FUNCIÓN RPC: decrement_inventory ──────────────────────────────────────
-- Descuento ATÓMICO de inventario — elimina race condition bajo ventas concurrentes.
-- Equivale a: UPDATE inventory SET quantity = quantity - p_qty WHERE ...
-- Llamada desde markOrderPaid() en backend/server.js via supabaseAdmin.rpc(...)
CREATE OR REPLACE FUNCTION decrement_inventory(
  p_branch_id  UUID,
  p_product_id UUID,
  p_quantity   NUMERIC
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE inventory
  SET
    quantity   = quantity - p_quantity,
    updated_at = NOW()
  WHERE
    branch_id  = p_branch_id
    AND product_id = p_product_id;
$$;

-- Conceder acceso al service role (usado por supabaseAdmin — bypasa RLS)
GRANT EXECUTE ON FUNCTION decrement_inventory(UUID, UUID, NUMERIC) TO service_role;

-- ── 7. FUNCIÓN RPC: generate_order_number ────────────────────────────────────
-- Genera número de orden secuencial por sucursal: ORD-0001, ORD-0002, etc.
-- Si ya existe, este OR REPLACE actualiza sin perder la secuencia.
CREATE OR REPLACE FUNCTION generate_order_number(p_branch_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count  BIGINT;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) + 1
  INTO   v_count
  FROM   orders
  WHERE  branch_id = p_branch_id;

  v_number := 'ORD-' || LPAD(v_count::TEXT, 4, '0');
  RETURN v_number;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_order_number(UUID) TO service_role;

-- ── 8. TABLA: system_alerts (si no existe) ───────────────────────────────────
-- Alertas del sistema: stock bajo, sesión de caja sin cerrar, etc.
CREATE TABLE IF NOT EXISTS system_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id),
  alert_type      VARCHAR(50) NOT NULL,  -- 'low_stock', 'open_cash_session', 'sync_error'
  severity        VARCHAR(20) DEFAULT 'warning', -- 'info', 'warning', 'critical'
  title           TEXT NOT NULL,
  description     TEXT,
  data            JSONB DEFAULT '{}',
  is_resolved     BOOLEAN DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_org    ON system_alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_system_alerts_branch ON system_alerts(branch_id);
CREATE INDEX IF NOT EXISTS idx_system_alerts_type   ON system_alerts(alert_type);

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

-- RLS: cada organización solo ve sus propias alertas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'system_alerts' AND policyname = 'org_isolation'
  ) THEN
    CREATE POLICY org_isolation ON system_alerts
      USING (organization_id = (current_setting('request.jwt.claims', TRUE)::jsonb->>'organization_id')::UUID);
  END IF;
END $$;

-- ── 9. TABLA: sync_queue (si no existe) ──────────────────────────────────────
-- Cola offline en BD para auditoría de sincronizaciones
CREATE TABLE IF NOT EXISTS sync_queue (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_name      VARCHAR(100) NOT NULL,
  operation       VARCHAR(10)  NOT NULL,  -- 'INSERT', 'UPDATE', 'DELETE'
  payload         JSONB        NOT NULL,
  local_id        TEXT,
  retries         INT DEFAULT 0,
  last_error      TEXT,
  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── VERIFICACIÓN FINAL ────────────────────────────────────────────────────────
-- Ejecuta esto al final para confirmar que todo quedó creado:
SELECT
  'v_daily_sales'          AS nombre, 'VIEW' AS tipo WHERE EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_daily_sales')
UNION ALL SELECT
  'v_product_profitability', 'VIEW'           WHERE EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_product_profitability')
UNION ALL SELECT
  'v_inventory_status',      'VIEW'           WHERE EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_inventory_status')
UNION ALL SELECT
  'v_weekly_sales',          'VIEW'           WHERE EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_weekly_sales')
UNION ALL SELECT
  'decrement_inventory',     'FUNCTION'       WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'decrement_inventory')
UNION ALL SELECT
  'generate_order_number',   'FUNCTION'       WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_order_number')
UNION ALL SELECT
  'system_alerts',           'TABLE'          WHERE EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'system_alerts')
UNION ALL SELECT
  'branches.city_code',      'COLUMN'         WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'city_code'
  );
-- Resultado esperado: 8 filas, una por cada objeto.
