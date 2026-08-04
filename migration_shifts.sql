-- =============================================================================
-- FERZU POS — Migración: Módulo de Turnos y Asistencia (F3)
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS shifts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Tiempos
  clock_in        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out       TIMESTAMPTZ,
  break_start     TIMESTAMPTZ,
  break_end       TIMESTAMPTZ,
  -- Totales calculados al hacer clock-out
  total_minutes   INTEGER,        -- minutos trabajados (excluye descanso)
  break_minutes   INTEGER,        -- minutos de descanso
  -- Metadata
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS shifts_branch_date  ON shifts(branch_id, clock_in);
CREATE INDEX IF NOT EXISTS shifts_user_date    ON shifts(user_id, clock_in);
CREATE INDEX IF NOT EXISTS shifts_org          ON shifts(organization_id);
CREATE INDEX IF NOT EXISTS shifts_active       ON shifts(user_id) WHERE clock_out IS NULL;

-- RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_org_isolation" ON shifts
  FOR ALL
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_shifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_updated_at ON shifts;
CREATE TRIGGER shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_shifts_updated_at();
