-- Migration 011: Agregar columnas de descuento por lealtad en orders
-- Ejecutar en Supabase SQL Editor

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS loyalty_discount        BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER DEFAULT 0;

-- Refrescar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
