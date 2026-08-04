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
