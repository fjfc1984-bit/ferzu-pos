-- =============================================================================
-- FERZU POS — Migración 009: DIAN Facturación Electrónica (Completar)
-- Ejecutar en Supabase SQL Editor
-- Normativa: Resolución DIAN 0042/2020, Anexo Técnico 1.9
-- =============================================================================
-- QUÉ HACE ESTA MIGRACIÓN:
--   1. Unifica las dos versiones de dian_configs (001 y 002) — columnas faltantes
--   2. Crea la función atómica get_next_invoice_number() — CRÍTICA para el trigger
--   3. Crea tabla credit_notes — para notas de crédito al anular facturas
--   4. Agrega columna credit_note_ref a electronic_invoices
--   5. Políticas RLS para credit_notes
-- =============================================================================


-- =============================================================================
-- BLOQUE 1: UNIFICAR dian_configs
-- Migration 001 tiene: provider, api_key, api_secret, resolution_from/to, resolution_expires_at
-- Migration 002 tiene: pta_provider, from_number, to_number (sin api_key)
-- El código de dian.js usa aliases para manejar ambas — aquí añadimos las que falten.
-- =============================================================================

-- Columnas de la versión 001 que pueden faltar en entornos que corrieron solo 002
ALTER TABLE dian_configs
  ADD COLUMN IF NOT EXISTS api_key              TEXT,
  ADD COLUMN IF NOT EXISTS api_secret           TEXT,
  ADD COLUMN IF NOT EXISTS resolution_prefix    VARCHAR(10),
  ADD COLUMN IF NOT EXISTS resolution_expires_at DATE,
  ADD COLUMN IF NOT EXISTS resolution_from      INTEGER,
  ADD COLUMN IF NOT EXISTS resolution_to        INTEGER;

-- Columnas de la versión 002 que pueden faltar en entornos que corrieron solo 001
ALTER TABLE dian_configs
  ADD COLUMN IF NOT EXISTS pta_provider         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS prefix               VARCHAR(10),
  ADD COLUMN IF NOT EXISTS from_number          INTEGER,
  ADD COLUMN IF NOT EXISTS to_number            INTEGER;

-- Columnas nuevas requeridas por el código pero ausentes en ambas versiones
ALTER TABLE dian_configs
  ADD COLUMN IF NOT EXISTS technical_key        TEXT,        -- Clave técnica DIAN para CUFE
  ADD COLUMN IF NOT EXISTS software_id          TEXT,        -- ID del software registrado en DIAN
  ADD COLUMN IF NOT EXISTS software_provider_nit TEXT,       -- NIT del proveedor de software
  ADD COLUMN IF NOT EXISTS resolution_end_date  TIMESTAMPTZ, -- Alias de resolution_expires_at (version 006)
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN dian_configs.technical_key IS
  'Clave técnica asignada por la DIAN al registrar el software. Se usa en el cálculo del CUFE (SHA-384).';
COMMENT ON COLUMN dian_configs.software_id IS
  'Identificador único del software en la DIAN (GUID de 8-4-4-4-12 caracteres).';
COMMENT ON COLUMN dian_configs.resolution_end_date IS
  'Fecha de vencimiento de la resolución DIAN (normalizado de resolution_expires_at).';


-- =============================================================================
-- BLOQUE 2: FUNCIÓN ATÓMICA get_next_invoice_number()
-- CRÍTICA: Sin esta función, triggerElectronicInvoice() falla en cada venta.
-- Usa FOR UPDATE para garantizar atomicidad bajo concurrencia (múltiples cajeros).
-- Retorna el número ACTUAL antes de incrementar (= número a usar en esta factura).
-- =============================================================================

CREATE OR REPLACE FUNCTION get_next_invoice_number(p_organization_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER  -- Ejecuta como owner, bypass RLS
AS $$
DECLARE
  v_current   INTEGER;
  v_to        INTEGER;
  v_prefix    TEXT;
BEGIN
  -- Lock exclusivo en la fila para evitar race conditions con múltiples cajeros
  SELECT
    COALESCE(current_number, 1),
    COALESCE(to_number, resolution_to, 9999999),
    COALESCE(prefix, resolution_prefix, 'FE')
  INTO v_current, v_to, v_prefix
  FROM dian_configs
  WHERE organization_id = p_organization_id
    AND is_active = TRUE
  LIMIT 1
  FOR UPDATE;

  -- Si no hay configuración activa → retornar NULL (el backend maneja este caso)
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Verificar que la numeración no se haya agotado
  IF v_current > v_to THEN
    RAISE EXCEPTION 'Numeración DIAN agotada. El número actual (%) supera el rango autorizado (hasta %). '
      'Renueva la resolución DIAN antes de continuar emitiendo facturas.',
      v_current, v_to;
  END IF;

  -- Incrementar el contador (atómico por el FOR UPDATE)
  UPDATE dian_configs
  SET
    current_number = current_number + 1,
    updated_at     = NOW()
  WHERE organization_id = p_organization_id
    AND is_active = TRUE;

  -- Alertar si queda menos del 10% de la numeración
  IF (v_to - v_current) < GREATEST(FLOOR((v_to - COALESCE(from_number, resolution_from, 1)) * 0.1), 100) THEN
    INSERT INTO system_alerts (
      organization_id,
      alert_type,
      severity,
      title,
      description,
      data
    )
    SELECT
      p_organization_id,
      'dian_numbering_low',
      CASE WHEN (v_to - v_current) < 50 THEN 'critical' ELSE 'high' END,
      'Numeración DIAN próxima a agotarse',
      format('Solo quedan %s números disponibles en la resolución DIAN (hasta %s%s). '
             'Solicita una nueva resolución a la DIAN antes de que se agote.',
             v_to - v_current, v_prefix, v_to),
      jsonb_build_object(
        'current_number', v_current,
        'to_number', v_to,
        'remaining', v_to - v_current
      )
    WHERE NOT EXISTS (
      -- Evitar alertas duplicadas si ya hay una activa del mismo tipo
      SELECT 1 FROM system_alerts
      WHERE organization_id = p_organization_id
        AND alert_type = 'dian_numbering_low'
        AND resolved_at IS NULL
        AND created_at > NOW() - INTERVAL '24 hours'
    );
  END IF;

  -- Retornar el número a usar (el que había ANTES del incremento)
  RETURN v_current;
END;
$$;

COMMENT ON FUNCTION get_next_invoice_number(UUID) IS
  'Retorna el próximo número de factura electrónica de forma atómica (FOR UPDATE). '
  'Incrementa current_number en dian_configs. Lanza excepción si la numeración está agotada. '
  'Genera alerta automática cuando queda menos del 10% de la numeración autorizada.';


-- =============================================================================
-- BLOQUE 3: TABLA credit_notes — Notas de crédito DIAN
-- Requerida cuando se anula una orden que ya tiene factura electrónica.
-- La DIAN obliga a emitir una NC antes de anular cualquier FE aceptada.
-- =============================================================================

CREATE TABLE IF NOT EXISTS credit_notes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Factura original que se está anulando/ajustando
  original_invoice_id   UUID REFERENCES electronic_invoices(id),
  original_order_id     UUID REFERENCES orders(id),
  -- Numeración DIAN de la nota de crédito
  note_prefix           VARCHAR(10),          -- Ej: 'NC'
  note_number           VARCHAR(20) NOT NULL, -- Ej: 'NC000000001'
  cude                  VARCHAR(200),         -- Código único de la nota de crédito
  -- Motivo (códigos DIAN: 1=Devolución, 2=Anulación, 3=Descuento, 4=Ajuste precio, 5=Otro)
  correction_concept    VARCHAR(5) DEFAULT '2',  -- '2' = Anulación
  correction_description TEXT,
  -- Estado en la DIAN
  dian_status           VARCHAR(30) DEFAULT 'pending',
  dian_response         JSONB,
  dian_errors           JSONB,
  -- Datos del receptor (copiados de la factura original)
  customer_name         VARCHAR(255),
  customer_nit          VARCHAR(30),
  customer_email        VARCHAR(255),
  -- Totales (negativo del valor anulado)
  subtotal              BIGINT NOT NULL DEFAULT 0,
  tax_total             BIGINT NOT NULL DEFAULT 0,
  total                 BIGINT NOT NULL DEFAULT 0,
  -- Documentos
  xml_url               TEXT,
  pdf_url               TEXT,
  -- Auditoría
  issued_at             TIMESTAMPTZ DEFAULT NOW(),
  sent_at               TIMESTAMPTZ,
  accepted_at           TIMESTAMPTZ,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_org
  ON credit_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_original_invoice
  ON credit_notes(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status
  ON credit_notes(dian_status);

COMMENT ON TABLE credit_notes IS
  'Notas de crédito electrónicas DIAN. Se generan al anular una factura electrónica aceptada. '
  'Obligatorio según Resolución 0042/2020 — no se puede anular una FE sin una NC previa.';


-- =============================================================================
-- BLOQUE 4: AGREGAR REFERENCIA A credit_notes EN electronic_invoices
-- Para saber si una factura ya tiene nota de crédito emitida.
-- =============================================================================

ALTER TABLE electronic_invoices
  ADD COLUMN IF NOT EXISTS credit_note_id   UUID REFERENCES credit_notes(id),
  ADD COLUMN IF NOT EXISTS voided_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason      TEXT;


-- =============================================================================
-- BLOQUE 5: RLS PARA credit_notes
-- Misma política que electronic_invoices: solo la propia organización puede verlas.
-- =============================================================================

ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_notes_select_own_org" ON credit_notes;
CREATE POLICY "credit_notes_select_own_org" ON credit_notes
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "credit_notes_insert_own_org" ON credit_notes;
CREATE POLICY "credit_notes_insert_own_org" ON credit_notes
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "credit_notes_update_own_org" ON credit_notes;
CREATE POLICY "credit_notes_update_own_org" ON credit_notes
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );


-- =============================================================================
-- BLOQUE 6: VERIFICACIÓN FINAL
-- =============================================================================

DO $$
DECLARE
  fn_exists BOOLEAN;
  tbl_exists BOOLEAN;
BEGIN
  -- Verificar función get_next_invoice_number
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_next_invoice_number'
  ) INTO fn_exists;

  IF fn_exists THEN
    RAISE NOTICE '✅ get_next_invoice_number(): función creada correctamente';
  ELSE
    RAISE WARNING '❌ get_next_invoice_number(): FALLÓ la creación';
  END IF;

  -- Verificar tabla credit_notes
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'credit_notes'
  ) INTO tbl_exists;

  IF tbl_exists THEN
    RAISE NOTICE '✅ credit_notes: tabla creada correctamente';
  ELSE
    RAISE WARNING '❌ credit_notes: FALLÓ la creación';
  END IF;

  -- Verificar columna technical_key en dian_configs
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dian_configs' AND column_name = 'technical_key'
  ) INTO fn_exists;

  IF fn_exists THEN
    RAISE NOTICE '✅ dian_configs.technical_key: columna OK';
  ELSE
    RAISE WARNING '❌ dian_configs.technical_key: columna NO encontrada';
  END IF;

  -- Verificar columna credit_note_id en electronic_invoices
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'electronic_invoices' AND column_name = 'credit_note_id'
  ) INTO fn_exists;

  IF fn_exists THEN
    RAISE NOTICE '✅ electronic_invoices.credit_note_id: columna OK';
  ELSE
    RAISE WARNING '❌ electronic_invoices.credit_note_id: columna NO encontrada';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=== Migración 009 completada ===';
  RAISE NOTICE 'PASO SIGUIENTE: Configura dian_configs con tus datos reales:';
  RAISE NOTICE '  - resolution_number: número de resolución DIAN';
  RAISE NOTICE '  - prefix / resolution_prefix: prefijo autorizado (ej: SETP)';
  RAISE NOTICE '  - from_number / to_number: rango numérico autorizado';
  RAISE NOTICE '  - technical_key: clave técnica del software en DIAN';
  RAISE NOTICE '  - api_key: credencial de tu PTA (Alegra/Siigo/custom)';
  RAISE NOTICE '  - is_active: true (solo después de configurar todo lo anterior)';
END $$;
