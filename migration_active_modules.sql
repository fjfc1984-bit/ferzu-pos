-- =============================================================================
-- FERZU POS — Migration: active_modules por organización
-- Ejecutar en: Supabase > SQL Editor
-- =============================================================================
-- Este campo permite al dueño activar/desactivar módulos dentro de los límites
-- de su plan. Lógica: plan.enabled_modules es el techo (lo que pagó),
-- active_modules es la preferencia del dueño (lo que quiere usar).
-- Un módulo ausente en active_modules = activo (si el plan lo incluye).
-- Un módulo con valor false en active_modules = desactivado por el dueño.
-- 'pos' nunca puede desactivarse (núcleo del sistema).
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS active_modules JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organizations.active_modules IS
  'Control del dueño sobre módulos dentro del plan.
   Formato: { "dian": false, "customers": false }
   — ausente o true = activo (si el plan lo incluye).
   El módulo pos siempre está activo y no puede desactivarse.';

-- Índice para consultas rápidas por org
CREATE INDEX IF NOT EXISTS idx_organizations_active_modules
  ON organizations USING gin(active_modules);
