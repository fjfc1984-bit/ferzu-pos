-- =============================================================================
-- FERZU POS — ROW LEVEL SECURITY POLICIES
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- Garantiza aislamiento total entre organizaciones (multi-tenant)
-- =============================================================================

-- IMPORTANTE: Ejecutar PRIMERO la función helper que extrae organization_id
-- desde el JWT o desde la tabla users

-- ── 0. Función helper: obtener organization_id del usuario actual ─────────────
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- ── 1. ORGANIZATIONS ──────────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_own" ON organizations
  FOR SELECT USING (id = get_user_org_id());

CREATE POLICY "org_update_own" ON organizations
  FOR UPDATE USING (id = get_user_org_id());

-- ── 2. USERS ─────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_same_org" ON users
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "users_insert_own_org" ON users
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- ── 3. BRANCHES ──────────────────────────────────────────────────────────────
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branches_select_own_org" ON branches
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "branches_insert_own_org" ON branches
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "branches_update_own_org" ON branches
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "branches_delete_own_org" ON branches
  FOR DELETE USING (organization_id = get_user_org_id());

-- ── 4. PRODUCTS ──────────────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_own_org" ON products
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "products_insert_own_org" ON products
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "products_update_own_org" ON products
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "products_delete_own_org" ON products
  FOR DELETE USING (organization_id = get_user_org_id());

-- ── 5. CATEGORIES ────────────────────────────────────────────────────────────
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_own_org" ON categories
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "categories_all_own_org" ON categories
  FOR ALL USING (organization_id = get_user_org_id());

-- ── 6. INVENTORY ─────────────────────────────────────────────────────────────
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_select_own_org" ON inventory
  FOR SELECT USING (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );

CREATE POLICY "inventory_all_own_org" ON inventory
  FOR ALL USING (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );

-- ── 7. ORDERS ────────────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_own_org" ON orders
  FOR SELECT USING (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );

CREATE POLICY "orders_insert_own_org" ON orders
  FOR INSERT WITH CHECK (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );

CREATE POLICY "orders_update_own_org" ON orders
  FOR UPDATE USING (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );

-- ── 8. ORDER_ITEMS ───────────────────────────────────────────────────────────
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_select_own_org" ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN branches b ON o.branch_id = b.id
      WHERE b.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "order_items_insert_own_org" ON order_items
  FOR INSERT WITH CHECK (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN branches b ON o.branch_id = b.id
      WHERE b.organization_id = get_user_org_id()
    )
  );

-- ── 9. CASH_SESSIONS ─────────────────────────────────────────────────────────
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_sessions_own_org" ON cash_sessions
  FOR ALL USING (
    branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );

-- ── 10. CUSTOMERS ────────────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_own_org" ON customers
  FOR ALL USING (organization_id = get_user_org_id());

-- ── 11. AI_CHAT_HISTORY ──────────────────────────────────────────────────────
ALTER TABLE ai_chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_chat_own_user" ON ai_chat_history
  FOR ALL USING (user_id = auth.uid());

-- ── 12. SUBSCRIPTIONS / PLAN_ACTIVATIONS ─────────────────────────────────────
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_own_org" ON subscriptions
  FOR SELECT USING (organization_id = get_user_org_id());

-- Solo el backend (service role) puede insertar/actualizar suscripciones
-- El service role bypassa RLS automáticamente

-- ── 13. Política especial: Service Role bypassa todo (ya es automático) ───────
-- El SUPABASE_SERVICE_ROLE_KEY usado en el backend bypassa RLS por defecto
-- No necesita configuración adicional

-- ── VERIFICAR que las policies están activas ──────────────────────────────────
-- Ejecutar esto para confirmar:
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
