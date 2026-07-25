-- =============================================================================
-- FERZU POS — Vistas SQL para Dashboard, Inventario y Rentabilidad
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

-- ============================================================
-- VISTA: v_inventory_status
-- Usada por GET /inventory
-- ============================================================
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
    WHEN i.quantity <= COALESCE(p.min_stock,0) THEN 'low_stock'
    ELSE 'ok'
  END                                              AS stock_status,
  p.unit_of_measure,
  p.price,
  COALESCE(i.average_cost, p.cost, 0)             AS average_cost,
  (i.quantity * p.price)                           AS stock_value,
  c.name                                           AS category_name,
  c.color                                          AS category_color
FROM inventory i
JOIN products  p ON p.id = i.product_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.is_active = TRUE
  AND p.track_inventory = TRUE;

-- ============================================================
-- VISTA: v_daily_sales
-- Usada por GET /reports/dashboard
-- ============================================================
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

-- ============================================================
-- VISTA: v_product_profitability
-- Usada por GET /reports/dashboard (top productos)
-- ============================================================
CREATE OR REPLACE VIEW v_product_profitability AS
SELECT
  oi.product_id,
  oi.product_name,
  oi.product_sku,
  o.branch_id,
  SUM(oi.quantity)                                          AS total_units_sold,
  COALESCE(SUM(oi.subtotal + COALESCE(oi.vat_amount,0)), 0) AS total_revenue,
  COALESCE(SUM(COALESCE(oi.unit_cost,0) * oi.quantity), 0)  AS total_cost,
  COALESCE(SUM(oi.subtotal + COALESCE(oi.vat_amount,0)
    - COALESCE(oi.unit_cost,0) * oi.quantity), 0)           AS total_profit,
  CASE
    WHEN SUM(oi.subtotal + COALESCE(oi.vat_amount,0)) > 0
    THEN ROUND(
      SUM(oi.subtotal + COALESCE(oi.vat_amount,0)
        - COALESCE(oi.unit_cost,0) * oi.quantity) * 100.0
      / SUM(oi.subtotal + COALESCE(oi.vat_amount,0)), 1)
    ELSE 0
  END                                                       AS profit_margin_pct
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'paid'
GROUP BY oi.product_id, oi.product_name, oi.product_sku, o.branch_id;

-- ============================================================
-- VISTA: v_weekly_sales (bonus — para el dashboard de tendencias)
-- ============================================================
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
