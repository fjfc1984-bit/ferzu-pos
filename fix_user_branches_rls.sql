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
