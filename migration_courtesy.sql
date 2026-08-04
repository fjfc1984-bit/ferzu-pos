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
