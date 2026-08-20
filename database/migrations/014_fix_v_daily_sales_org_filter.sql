-- =============================================================================
-- FERZU POS — Migración 014: Agregar organization_id a v_daily_sales
-- Fecha: 2026-08-20
-- Problema: v_daily_sales no exponía organization_id, impidiendo el filtro
--   multi-tenant en queryBusinessData (supabaseAdmin bypasa RLS).
-- Solución: JOIN con branches para exponer b.organization_id en la vista.
-- Seguro para ejecutar múltiples veces (CREATE OR REPLACE).
-- =============================================================================

-- ── Vista v_daily_sales con organization_id ───────────────────────────────────
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  b.organization_id,                                                    -- NUEVO: para filtro multi-tenant
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
JOIN branches b ON b.id = o.branch_id                                  -- NUEVO: JOIN para exponer org
WHERE o.status = 'paid'
GROUP BY
  b.organization_id,                                                    -- NUEVO
  o.branch_id,
  DATE(o.created_at AT TIME ZONE 'America/Bogota');

-- ── v_weekly_sales también necesita organization_id ───────────────────────────
CREATE OR REPLACE VIEW v_weekly_sales AS
SELECT
  b.organization_id,                                                    -- NUEVO
  o.branch_id,
  DATE_TRUNC('week', o.created_at AT TIME ZONE 'America/Bogota') AS week_start,
  COUNT(*)                                            AS total_orders,
  COALESCE(SUM(o.total), 0)                          AS total_revenue,
  COALESCE(ROUND(AVG(o.total))::BIGINT, 0)           AS avg_ticket,
  COUNT(DISTINCT o.customer_id)                       AS unique_customers
FROM orders o
JOIN branches b ON b.id = o.branch_id
WHERE o.status = 'paid'
GROUP BY
  b.organization_id,
  o.branch_id,
  DATE_TRUNC('week', o.created_at AT TIME ZONE 'America/Bogota');

-- ── Reload PostgREST schema cache ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── Verificación ──────────────────────────────────────────────────────────────
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'v_daily_sales'
ORDER BY ordinal_position;
-- Resultado esperado: organization_id, branch_id, sale_date, total_orders, ...
