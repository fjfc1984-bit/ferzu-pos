-- Migration 013: Campos de contacto y régimen tributario en organizations
-- Para mostrar en recibos/facturas

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS address    TEXT,
  ADD COLUMN IF NOT EXISTS phone      TEXT,
  ADD COLUMN IF NOT EXISTS tax_regime TEXT DEFAULT 'No responsable de IVA';

NOTIFY pgrst, 'reload schema';
