-- =============================================================================
-- FERZU POS — Migration 006: Features B, C, D
-- Analytics de uso + WhatsApp settings + DIAN resolution_end_date
-- =============================================================================
-- Ejecutar en Supabase: SQL Editor → New query → Paste → Run
-- =============================================================================


-- =============================================================================
-- FEATURE D: DIAN Wizard
-- Agregar columna resolution_end_date a dian_configs
-- (la fecha de vencimiento de la resolución DIAN, separada de resolution_date)
-- =============================================================================

ALTER TABLE dian_configs
  ADD COLUMN IF NOT EXISTS resolution_end_date TIMESTAMPTZ;

COMMENT ON COLUMN dian_configs.resolution_end_date IS
  'Fecha de vencimiento de la resolución DIAN (diferente a resolution_date que es la fecha de emisión)';


-- =============================================================================
-- FEATURE B: Analytics de Uso
-- Tabla de eventos de uso por módulo para tracking interno SaaS
-- =============================================================================

CREATE TABLE IF NOT EXISTS usage_events (
  id               BIGSERIAL    PRIMARY KEY,
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type       VARCHAR(50)  NOT NULL,
  module           VARCHAR(30),
  metadata         JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Índices para queries de dashboard analítico
CREATE INDEX IF NOT EXISTS idx_usage_events_org_time
  ON usage_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_module
  ON usage_events (module, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_event_type
  ON usage_events (event_type, created_at DESC);

-- Solo el service role puede insertar y leer (backend maneja todo)
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- El frontend no accede a esta tabla directamente — solo vía API backend
-- El backend usa service_role_key, que bypasea RLS
CREATE POLICY "usage_events_service_only" ON usage_events
  FOR ALL
  USING (false)   -- ningún cliente puede leer
  WITH CHECK (false); -- ningún cliente puede insertar


-- =============================================================================
-- FEATURE C: WhatsApp Settings
-- Columna JSONB en organizations para preferencias de notificaciones
-- (el token NUNCA se guarda en DB — va en Railway env vars)
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::JSONB;

COMMENT ON COLUMN organizations.settings IS
  'Configuración JSON de la organización: whatsapp_auto (bool), whatsapp_phone (string), etc.';

-- Índice GIN para queries sobre settings JSONB
CREATE INDEX IF NOT EXISTS idx_organizations_settings
  ON organizations USING GIN (settings);


-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================

DO $$
DECLARE
  col_exists  BOOLEAN;
  table_exists BOOLEAN;
BEGIN
  -- Verificar resolution_end_date
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dian_configs' AND column_name = 'resolution_end_date'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE '✅ dian_configs.resolution_end_date: OK';
  ELSE
    RAISE WARNING '❌ dian_configs.resolution_end_date: NO encontrada';
  END IF;

  -- Verificar usage_events
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'usage_events'
  ) INTO table_exists;

  IF table_exists THEN
    RAISE NOTICE '✅ usage_events: tabla creada';
  ELSE
    RAISE WARNING '❌ usage_events: tabla NO encontrada';
  END IF;

  -- Verificar organizations.settings
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'settings'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE '✅ organizations.settings: OK';
  ELSE
    RAISE WARNING '❌ organizations.settings: NO encontrada';
  END IF;
END $$;
