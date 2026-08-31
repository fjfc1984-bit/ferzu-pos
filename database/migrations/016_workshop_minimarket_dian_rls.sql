-- =============================================================================
-- FERZU POS — Migration 016: RLS para Taller / Minimarket / Facturación DIAN
-- Fecha: 2026-08-31
-- Seguro para ejecutar múltiples veces (DROP POLICY IF EXISTS / CREATE)
--
-- HALLAZGO (revisión de seguridad 2026-08-31):
--   work_orders, work_order_items y product_batches solo se crearon con
--   ENABLE ROW LEVEL SECURITY en seed_dev.sql (marcado "NO ejecutar en
--   producción") y CERO policies reales — las políticas correctas solo
--   existían como comentario muerto dentro de WorkshopPage.jsx, nunca
--   ejecutadas. electronic_invoices tiene RLS habilitado desde schema.sql
--   pero tampoco tiene ninguna policy.
--
--   Sin policies, según el estado real en producción, cada tabla queda:
--   - Si RLS quedó habilitado sin políticas → fail-closed: el módulo de
--     Taller/Minimarket/DIAN no funciona para nadie (defecto funcional).
--   - Si RLS nunca se habilitó → fail-open: cualquier usuario autenticado
--     de CUALQUIER organización puede leer/escribir órdenes de trabajo
--     (con datos de clientes, placas, teléfonos), lotes de inventario y
--     facturas electrónicas de TODOS los negocios.
--
--   Esta migración deja las 4 tablas en el único estado correcto,
--   independientemente de cuál de los dos estuviera vigente.
-- =============================================================================

-- ── 1. WORK_ORDERS — órdenes de trabajo de taller (tiene organization_id) ────
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_orders_own_org" ON work_orders;
CREATE POLICY "work_orders_own_org" ON work_orders
  FOR ALL
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());


-- ── 2. WORK_ORDER_ITEMS — no tiene organization_id, se resuelve via work_orders ─
ALTER TABLE work_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_order_items_own_org" ON work_order_items;
CREATE POLICY "work_order_items_own_org" ON work_order_items
  FOR ALL
  USING (
    work_order_id IN (
      SELECT id FROM work_orders WHERE organization_id = get_user_org_id()
    )
  )
  WITH CHECK (
    work_order_id IN (
      SELECT id FROM work_orders WHERE organization_id = get_user_org_id()
    )
  );


-- ── 3. PRODUCT_BATCHES — lotes de inventario con vencimiento (minimarket) ────
ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_batches_own_org" ON product_batches;
CREATE POLICY "product_batches_own_org" ON product_batches
  FOR ALL
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());


-- ── 4. ELECTRONIC_INVOICES — facturación DIAN (solo lectura del cliente) ─────
-- El backend (service role) es quien genera/actualiza las facturas — el
-- comerciante solo debe poder LEER las suyas, igual que dian_configs (007).
ALTER TABLE electronic_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "electronic_invoices_select_own_org" ON electronic_invoices;
CREATE POLICY "electronic_invoices_select_own_org" ON electronic_invoices
  FOR SELECT
  USING (organization_id = get_user_org_id());

-- INSERT/UPDATE/DELETE solo por service role (backend) — sin policy adicional.


-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- SELECT tablename, COUNT(*) AS num_policies, ARRAY_AGG(policyname) AS policies
-- FROM pg_policies
-- WHERE tablename IN ('work_orders', 'work_order_items', 'product_batches', 'electronic_invoices')
-- GROUP BY tablename
-- ORDER BY tablename;
-- =============================================================================
