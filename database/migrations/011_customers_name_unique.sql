-- =============================================================================
-- Migration 011: UNIQUE constraint en customers(organization_id, name)
-- Requerido para que el upsert de WorkshopPage funcione correctamente con
-- onConflict: 'organization_id,name' vía PostgREST/Supabase.
-- =============================================================================

-- 1. Limpiar duplicados antes de crear el constraint (por seguridad)
--    Conserva el registro más antiguo (created_at menor) por cada (org, name).
DELETE FROM customers
WHERE id NOT IN (
  SELECT DISTINCT ON (organization_id, name) id
  FROM customers
  ORDER BY organization_id, name, created_at ASC
);

-- 2. Crear el constraint UNIQUE
ALTER TABLE customers
  ADD CONSTRAINT customers_org_name_unique
  UNIQUE (organization_id, name);

-- 3. Verificación
SELECT
  tc.constraint_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'customers'
  AND tc.constraint_type = 'UNIQUE'
ORDER BY kcu.ordinal_position;
