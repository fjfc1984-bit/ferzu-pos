-- =============================================================================
-- FERZU POS — Trigger: sync_org_plan
-- Pegar en: Supabase Dashboard → SQL Editor → New Query
--
-- Qué hace: Cada vez que se inserta o actualiza una fila en `subscriptions`,
-- copia automáticamente plan_id y enabled_modules a `organizations`.
-- Es la capa de seguridad que garantiza consistencia aunque el backend falle.
-- =============================================================================

-- 1. Función que ejecuta el trigger
CREATE OR REPLACE FUNCTION sync_org_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE organizations
  SET
    plan_id         = NEW.plan_id,
    enabled_modules = NEW.enabled_modules,
    updated_at      = NOW()
  WHERE id = NEW.organization_id;

  RETURN NEW;
END;
$$;

-- 2. Trigger que dispara la función en cada INSERT o UPDATE de subscriptions
DROP TRIGGER IF EXISTS trg_sync_org_plan ON subscriptions;

CREATE TRIGGER trg_sync_org_plan
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_org_plan();

-- 3. Verificación: listar triggers activos en la tabla subscriptions
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'subscriptions'
ORDER BY trigger_name;
