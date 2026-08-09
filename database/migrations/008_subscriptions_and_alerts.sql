-- =============================================================================
-- FERZU POS — Migration 008: Formalización subscriptions + system_alerts
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Seguro para re-ejecutar: todos los cambios son idempotentes (IF NOT EXISTS)
-- =============================================================================

-- ── 1. COLUMNAS FALTANTES EN subscriptions ────────────────────────────────────
-- El webhook Bold hace upsert con estas 4 columnas (payments.routes.js línea 184-195)
-- pero migration 006 creó la tabla sin ellas → cada pago aprobado falla silenciosamente.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS enabled_modules  JSONB    DEFAULT '[]'::jsonb;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS max_products     INTEGER  DEFAULT 0;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS max_users        INTEGER  DEFAULT 0;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS max_branches     INTEGER  DEFAULT 0;

-- ── 2. COLUMNA FALTANTE EN organizations ──────────────────────────────────────
-- payments.routes.js línea 211: organizations.update({ plan_expires_at: ... })
-- Si la columna no existe → Supabase la ignora silenciosamente (no hay error),
-- pero el valor nunca se persiste → ModuleGuard no puede verificar expiración.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_expires_at  TIMESTAMPTZ;

-- ── 3. CORREGIR DEFAULT DE enabled_modules EN organizations ───────────────────
-- Migration 006 usó DEFAULT '{}'::jsonb (objeto vacío).
-- El código en requirePlanFeature y ModuleGuard usa Array.includes() sobre este valor.
-- Un objeto vacío {} hace que includes() falle silenciosamente → todos los módulos
-- aparecen como bloqueados incluso durante trial o en plan free.

ALTER TABLE public.organizations
  ALTER COLUMN enabled_modules SET DEFAULT '[]'::jsonb;

-- Corregir filas existentes que tengan {} (objeto vacío) en lugar de [] (array vacío).
-- Solo toca filas donde el valor es literalmente el objeto vacío — no datos reales.
UPDATE public.organizations
  SET enabled_modules = '[]'::jsonb
  WHERE enabled_modules = '{}'::jsonb;

-- Misma corrección para active_modules (mismo problema, mismo origen).
ALTER TABLE public.organizations
  ALTER COLUMN active_modules SET DEFAULT '[]'::jsonb;

UPDATE public.organizations
  SET active_modules = '[]'::jsonb
  WHERE active_modules = '{}'::jsonb;

-- ── 4. resolved_at EN system_alerts ───────────────────────────────────────────
-- Definida en migrations 001/002/005 pero puede no estar en la BD de producción
-- si esas migraciones se ejecutaron en un orden diferente o fueron parciales.
-- alerts.routes.js línea PATCH hace: .update({ resolved_at: new Date() })
-- Si la columna no existe → Supabase ignora el campo → la alerta nunca se resuelve.

ALTER TABLE public.system_alerts
  ADD COLUMN IF NOT EXISTS resolved_at  TIMESTAMPTZ;

-- ── 5. ÍNDICES DE PERFORMANCE PARA EL PANEL DE ALERTAS ───────────────────────
-- AlertsPage.jsx hace: GET /api/alerts?resolved=false&severity=critical
-- Estos índices aceleran el filtrado más común (alertas sin resolver por org).

CREATE INDEX IF NOT EXISTS idx_system_alerts_org_resolved
  ON public.system_alerts (organization_id, is_resolved);

CREATE INDEX IF NOT EXISTS idx_system_alerts_org_severity
  ON public.system_alerts (organization_id, severity);

CREATE INDEX IF NOT EXISTS idx_system_alerts_created_at
  ON public.system_alerts (created_at DESC);

-- ── 6. ÍNDICE EN subscriptions.organization_id (ya existe en 006, idempotente) ─
CREATE INDEX IF NOT EXISTS idx_subscriptions_organization_id
  ON public.subscriptions (organization_id);

-- =============================================================================
-- VERIFICACIÓN
-- Ejecutar estas queries después de aplicar la migración para confirmar:
-- =============================================================================

-- 1. Columnas nuevas en subscriptions:
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'subscriptions'
--    AND column_name IN ('enabled_modules','max_products','max_users','max_branches')
--  ORDER BY column_name;

-- 2. Columna plan_expires_at y defaults corregidos en organizations:
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'organizations'
--    AND column_name IN ('enabled_modules','active_modules','plan_expires_at')
--  ORDER BY column_name;

-- 3. Columna resolved_at en system_alerts:
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'system_alerts'
--    AND column_name = 'resolved_at';

-- 4. Índices creados:
-- SELECT indexname, tablename
--   FROM pg_indexes
--  WHERE tablename IN ('system_alerts','subscriptions')
--  ORDER BY tablename, indexname;
