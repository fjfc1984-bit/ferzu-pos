-- =============================================================================
-- FERZU POS — Migration 015: Critical RLS Fix
-- Fecha: 2026-08-31
-- Seguro para ejecutar múltiples veces (usa DROP ... IF EXISTS / CREATE OR REPLACE)
--
-- HALLAZGOS (revisión de seguridad 2026-08-31):
--   A. users_update_own (004) no restringe columnas → cualquier usuario autenticado
--      puede hacer PATCH /rest/v1/users?id=eq.<propio-id> con
--      {"role":"owner","organization_id":"<otra-org>"} y RLS lo acepta, porque
--      TODAS las demás policies confían en organization_id/role de esta tabla.
--      Es un bypass total de multi-tenant, peor que el bug histórico de cb4182a.
--   B. org_update_own (004) no valida rol → cualquier cajero puede hacer
--      PATCH /rest/v1/organizations?id=eq.<propia-org> y cambiar plan_id /
--      enabled_modules / max_users sin ser owner/admin.
--   D. user_branches (007) dejó activas dos policies de SELECT: la de
--      fix_user_branches_rls.sql (solo owner) y la de 007 (cualquier miembro,
--      sin chequeo de rol). Al combinarse con OR, gana la más permisiva:
--      cualquier cajero puede listar toda la nómina de sucursales de su org.
-- =============================================================================

-- ── A. USERS: bloquear auto-escalada de privilegios ──────────────────────────
-- RLS (USING/WITH CHECK) no puede restringir columnas individuales, así que
-- se usa un trigger BEFORE UPDATE. El service role (backend) sigue pudiendo
-- cambiar cualquier columna — el trigger solo se aplica a escrituras hechas
-- con el JWT del propio usuario (anon/authenticated).

CREATE OR REPLACE FUNCTION prevent_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- El backend (supabaseAdmin, service_role) bypassa este chequeo: los
  -- endpoints de onboarding/admin necesitan poder asignar organization_id/role.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'No autorizado: no puedes cambiar tu propio rol';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'No autorizado: no puedes cambiar tu organización';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'No autorizado: no puedes activar/desactivar tu propia cuenta';
  END IF;

  IF NEW.commission_pct IS DISTINCT FROM OLD.commission_pct THEN
    RAISE EXCEPTION 'No autorizado: no puedes cambiar tu propia comisión';
  END IF;

  -- pin_hash: el único uso legítimo del cliente es limpiarlo (poner NULL) al
  -- pulsar "Olvidé mi PIN" (ver AuthScreens.jsx). Fijar un hash real siempre
  -- pasa por el backend (PATCH /users/me/pin, bcrypt + supabaseAdmin).
  IF NEW.pin_hash IS DISTINCT FROM OLD.pin_hash AND NEW.pin_hash IS NOT NULL THEN
    RAISE EXCEPTION 'No autorizado: el PIN solo puede establecerse desde el backend';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_privilege_escalation ON users;
CREATE TRIGGER trg_prevent_self_privilege_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_self_privilege_escalation();


-- ── B. ORGANIZATIONS: solo owner/admin puede actualizar su organización ──────

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

DROP POLICY IF EXISTS "org_update_own" ON organizations;
CREATE POLICY "org_update_own" ON organizations
  FOR UPDATE
  USING (id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'))
  WITH CHECK (id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'));


-- ── D. USER_BRANCHES: eliminar la policy permisiva sin chequeo de rol ────────
-- Reemplaza "user_branches_select_org_mgr" (007, sin rol) y
-- "user_branches_select_org_owner" (fix_user_branches_rls.sql, ya cubierta)
-- por una sola policy: el propio usuario, o un owner/admin de la misma org.

DROP POLICY IF EXISTS "user_branches_select_org_mgr"   ON user_branches;
DROP POLICY IF EXISTS "user_branches_select_org_owner" ON user_branches;

CREATE POLICY "user_branches_select_org_mgr" ON user_branches
  FOR SELECT
  USING (
    get_user_role() IN ('owner', 'admin')
    AND branch_id IN (
      SELECT id FROM branches WHERE organization_id = get_user_org_id()
    )
  );

-- "user_branches_select_own" (cada usuario ve sus propias filas) no cambia.


-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- 1) Confirmar que el trigger quedó activo:
--    SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'users'::regclass;
--
-- 2) Confirmar las policies vigentes:
--    SELECT tablename, policyname, cmd, qual
--    FROM pg_policies
--    WHERE tablename IN ('users', 'organizations', 'user_branches')
--    ORDER BY tablename, policyname;
--
-- 3) Probar el exploit original ya NO funciona (con el JWT de un usuario común,
--    no service role):
--    UPDATE users SET role = 'owner', organization_id = '<otra-org>' WHERE id = auth.uid();
--    -- Debe fallar con "No autorizado: no puedes cambiar tu propio rol"
-- =============================================================================
