-- =============================================================================
-- Migration 011: UNIQUE partial index en customers(organization_id, phone)
-- Permite el upsert de WorkshopPage con onConflict: 'organization_id,phone'.
-- Es parcial (WHERE phone IS NOT NULL) porque phone es opcional.
-- =============================================================================

-- 1. Crear índice UNIQUE parcial en phone (no afecta clientes sin teléfono)
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_phone_unique
  ON public.customers (organization_id, phone)
  WHERE phone IS NOT NULL;

-- 2. Verificar
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'customers'
  AND indexname = 'customers_org_phone_unique';
