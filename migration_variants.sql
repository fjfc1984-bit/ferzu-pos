-- =============================================================================
-- FERZU POS — F9-C: Variantes de Producto
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

-- ── Variantes del producto ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_variants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,       -- "Rojo / Talla M"
  sku             TEXT,
  barcode         TEXT,
  price           BIGINT,                     -- NULL = hereda precio del producto base
  cost            BIGINT,
  attributes      JSONB       NOT NULL DEFAULT '{}',  -- {"color":"Rojo","talla":"M"}
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Stock por variante por sucursal ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variant_inventory (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID    NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  branch_id  UUID    NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity   BIGINT  NOT NULL DEFAULT 0,
  UNIQUE (variant_id, branch_id)
);

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pv_product    ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_pv_org        ON product_variants(organization_id);
CREATE INDEX IF NOT EXISTS idx_vi_variant    ON variant_inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_vi_branch     ON variant_inventory(branch_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE product_variants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pv_org" ON product_variants;
CREATE POLICY "pv_org" ON product_variants
  FOR ALL USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "vi_org" ON variant_inventory;
CREATE POLICY "vi_org" ON variant_inventory
  FOR ALL USING (
    variant_id IN (
      SELECT id FROM product_variants WHERE organization_id = get_user_org_id()
    )
  );

-- ── RPC: decrementar stock de variante ───────────────────────────────────────
CREATE OR REPLACE FUNCTION decrement_variant_inventory(
  p_branch_id  UUID,
  p_variant_id UUID,
  p_quantity   INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO variant_inventory (variant_id, branch_id, quantity)
  VALUES (p_variant_id, p_branch_id, -p_quantity)
  ON CONFLICT (variant_id, branch_id)
  DO UPDATE SET quantity = variant_inventory.quantity - p_quantity;
END;
$$;
