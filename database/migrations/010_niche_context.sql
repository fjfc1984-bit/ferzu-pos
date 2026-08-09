-- =============================================================================
-- FERZU POS — Migración 010: Contextualización por Nicho y Módulo
-- Fecha: 2026-08-09
-- Objetivo: Permitir que productos y clientes estén asociados a un nicho
--           específico de negocio para filtrado contextual por módulo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. products: columna niche
--    Valores: 'general' | 'barbershop' | 'workshop' | 'restaurant' | 'minimarket'
--    DEFAULT 'general' → los productos existentes siguen visibles en todos los módulos.
-- -----------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS niche VARCHAR(50) NOT NULL DEFAULT 'general';

-- Índice para búsquedas filtradas por niche + organization
CREATE INDEX IF NOT EXISTS idx_products_niche
  ON products(organization_id, niche, is_active);

-- -----------------------------------------------------------------------------
-- 2. customers: columna preferred_module
--    Registra en qué módulo fue creado/atendido el cliente por última vez.
--    Valores: NULL (sin preferencia) | 'barbershop' | 'workshop' | 'pos' | 'restaurant'
-- -----------------------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS preferred_module VARCHAR(50);

-- Índice para ordenar resultados de búsqueda priorizando módulo actual
CREATE INDEX IF NOT EXISTS idx_customers_preferred_module
  ON customers(organization_id, preferred_module);

-- -----------------------------------------------------------------------------
-- 3. Verificación
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'niche'
  ), 'ERROR: products.niche no fue creado';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'preferred_module'
  ), 'ERROR: customers.preferred_module no fue creado';

  RAISE NOTICE '✅ Migración 010 OK — products.niche y customers.preferred_module listos';
END $$;
