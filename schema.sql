-- =============================================================================
-- FERZU POS - ESQUEMA SQL COMPLETO PARA SUPABASE (POSTGRESQL)
-- Versión: 1.0.0
-- País: Colombia | Multi-Nicho | Multi-Tenant
-- Autor: Arquitectura FERZU
-- =============================================================================
-- NOTAS DE DISEÑO:
--   1. Multi-tenant via organizations + branches (Row Level Security por org)
--   2. Multi-nicho via business_type_configs (restaurant, minimarket, barbershop, workshop)
--   3. IA nunca escribe a tablas críticas → usa tabla ai_proposals (human-in-the-loop)
--   4. Offline-first → sync_status en transacciones críticas
--   5. Colombia → módulo DIAN separado (UBL 2.1, IVA 19%, retenciones)
-- =============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- BLOQUE 1: MULTI-TENANT (ORGANIZACIONES Y SUCURSALES)
-- =============================================================================

-- Tipos de negocio soportados
CREATE TYPE business_type AS ENUM (
  'restaurant',   -- Restaurantes, cafeterías, gastrobares
  'minimarket',   -- Tiendas, droguerías, licorerías
  'barbershop',   -- Barberías, peluquerías, spas
  'workshop',     -- Talleres mecánicos, técnicos, zapateros
  'generic'       -- Cualquier otro negocio
);

-- Estado de registros con soporte offline
CREATE TYPE sync_status AS ENUM ('synced', 'pending_sync', 'conflict');

-- Estado de propuestas de la IA
CREATE TYPE ai_proposal_status AS ENUM ('pending', 'approved', 'rejected', 'executed', 'expired');

-- Tipo de propuesta de la IA
CREATE TYPE ai_proposal_type AS ENUM (
  'inventory_entry',        -- Ingreso de inventario desde factura
  'purchase_order',         -- Borrador de pedido a proveedor
  'discount',               -- Propuesta de descuento
  'stock_adjustment',       -- Ajuste de stock (merma detectada)
  'marketing_message',      -- Mensaje de WhatsApp para cliente
  'price_update'            -- Actualización de precio
);

-- Tabla de organizaciones (empresas/negocios raíz)
CREATE TABLE organizations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(255) NOT NULL,
  legal_name        VARCHAR(255),                   -- Razón social
  nit               VARCHAR(20) UNIQUE,             -- NIT Colombia (sin dígito verificación)
  nit_dv            CHAR(1),                        -- Dígito de verificación
  business_type     business_type NOT NULL DEFAULT 'generic',
  email             VARCHAR(255) NOT NULL,
  phone             VARCHAR(20),
  logo_url          TEXT,
  -- Configuración fiscal Colombia
  tax_regime        VARCHAR(50) DEFAULT 'simplified', -- 'simplified' | 'common'
  is_vat_responsible BOOLEAN DEFAULT FALSE,          -- Responsable de IVA
  -- Plan SaaS
  plan              VARCHAR(30) DEFAULT 'starter',   -- 'starter' | 'pro' | 'enterprise'
  plan_expires_at   TIMESTAMPTZ,
  is_active         BOOLEAN DEFAULT TRUE,
  -- Metadata
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Sucursales / puntos de venta
CREATE TABLE branches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,           -- "Sede Norte", "Local Centro"
  address           TEXT,
  city              VARCHAR(100),
  city_code         VARCHAR(8),                      -- Código DIVIPOLA DANE (ej: '11001' Bogotá, '05001' Medellín)
  department        VARCHAR(100),                    -- Dpto Colombia
  phone             VARCHAR(20),
  is_active         BOOLEAN DEFAULT TRUE,
  -- Configuración de caja
  default_currency  CHAR(3) DEFAULT 'COP',
  timezone          VARCHAR(50) DEFAULT 'America/Bogota',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Usuarios del sistema
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             VARCHAR(255) NOT NULL UNIQUE,
  full_name         VARCHAR(255) NOT NULL,
  role              VARCHAR(30) NOT NULL DEFAULT 'cashier', -- 'owner' | 'admin' | 'cashier' | 'cook' | 'technician'
  pin               VARCHAR(6),                      -- PIN de 6 dígitos para acceso rápido en caja
  avatar_url        TEXT,
  -- Comisiones (aplica para barbershop/workshop)
  commission_pct    DECIMAL(5,2) DEFAULT 0,          -- % de comisión por servicio
  is_active         BOOLEAN DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Relación usuario ↔ sucursal (un usuario puede tener acceso a varias sedes)
CREATE TABLE user_branches (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  is_default        BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, branch_id)
);


-- =============================================================================
-- BLOQUE 2: CONFIGURACIÓN POR NICHO DE NEGOCIO
-- =============================================================================

-- Configuraciones específicas de nicho (JSON flexible)
-- En lugar de columnas dispersas, centralizamos las configs de cada tipo
CREATE TABLE business_type_configs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  config_key        VARCHAR(100) NOT NULL,           -- 'table_management', 'appointment_booking', etc.
  config_value      JSONB NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, config_key)
);
-- Ejemplo de registros:
-- restaurant  → {'table_management': true, 'kitchen_display': true, 'delivery': true}
-- barbershop  → {'appointment_booking': true, 'staff_commissions': true, 'wait_time_display': true}
-- workshop    → {'work_orders': true, 'parts_inventory': true, 'vehicle_tracking': true}
-- minimarket  → {'barcode_scanner': true, 'weight_scale': true, 'batch_pricing': true}


-- =============================================================================
-- BLOQUE 3: CATÁLOGO DE PRODUCTOS Y SERVICIOS
-- =============================================================================

-- Categorías (árbol jerárquico)
CREATE TABLE categories (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES categories(id),  -- Subcategorías
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  color             CHAR(7),                          -- Hex color para la UI (#FF5733)
  icon              VARCHAR(50),                      -- Nombre de ícono (Material Icons)
  sort_order        INTEGER DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Productos / Servicios (tabla unificada)
CREATE TABLE products (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id       UUID REFERENCES categories(id),
  sku               VARCHAR(100),                     -- Código interno
  barcode           VARCHAR(100),                     -- Código de barras (EAN-13, etc.)
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  image_url         TEXT,
  -- Tipo de ítem
  item_type         VARCHAR(20) NOT NULL DEFAULT 'product', -- 'product' | 'service' | 'combo' | 'raw_material'
  -- Precios (almacenamos en centavos/pesos SIN impuestos → impuesto calculado en backend)
  price             BIGINT NOT NULL DEFAULT 0,        -- Precio de venta en COP (pesos sin decimales)
  cost              BIGINT DEFAULT 0,                 -- Precio de costo
  -- IVA Colombia
  vat_rate          DECIMAL(5,2) DEFAULT 0,           -- 0, 5, 19 (%)
  vat_included      BOOLEAN DEFAULT TRUE,             -- Si el precio ya incluye IVA
  -- Control de inventario
  track_inventory   BOOLEAN DEFAULT TRUE,
  unit_of_measure   VARCHAR(20) DEFAULT 'unit',       -- 'unit' | 'kg' | 'ltr' | 'mtr'
  min_stock         DECIMAL(10,3) DEFAULT 0,          -- Punto de reorden
  -- Metadata
  is_active         BOOLEAN DEFAULT TRUE,
  is_featured       BOOLEAN DEFAULT FALSE,
  sort_order        INTEGER DEFAULT 0,
  -- Atributos específicos por nicho (JSON flexible)
  metadata          JSONB DEFAULT '{}',
  -- restaurant  → {'prep_time_minutes': 10, 'kitchen_station': 'grill', 'allergens': ['gluten']}
  -- barbershop  → {'duration_minutes': 45, 'staff_required': true}
  -- workshop    → {'labor_hours': 2.5, 'part_number': 'BRK-001'}
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Variantes de producto (tallas, colores, tamaños)
CREATE TABLE product_variants (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku_variant       VARCHAR(100),
  barcode           VARCHAR(100),
  name              VARCHAR(255) NOT NULL,            -- "Talla M - Rojo", "Grande"
  price_modifier    BIGINT DEFAULT 0,                 -- Diferencia de precio vs producto base
  cost_modifier     BIGINT DEFAULT 0,
  attributes        JSONB DEFAULT '{}',               -- {'size': 'M', 'color': 'red'}
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Combos / Menús (relación producto compuesto → ingredientes)
CREATE TABLE combo_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  combo_product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_id      UUID NOT NULL REFERENCES products(id),
  quantity          DECIMAL(10,3) NOT NULL DEFAULT 1,
  is_optional       BOOLEAN DEFAULT FALSE,            -- ¿El cliente puede quitarlo?
  price_override    BIGINT                            -- Si NULL, usa precio del componente
);


-- =============================================================================
-- BLOQUE 4: INVENTARIO
-- =============================================================================

-- Inventario por sucursal
CREATE TABLE inventory (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id        UUID REFERENCES product_variants(id),
  quantity          DECIMAL(10,3) NOT NULL DEFAULT 0,
  reserved_qty      DECIMAL(10,3) DEFAULT 0,          -- Cantidad reservada en pedidos activos
  last_cost         BIGINT DEFAULT 0,                 -- Último costo de compra
  average_cost      BIGINT DEFAULT 0,                 -- Costo promedio ponderado
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, product_id, variant_id)
);

-- Movimientos de inventario (trazabilidad completa)
CREATE TABLE inventory_movements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  product_id        UUID NOT NULL REFERENCES products(id),
  variant_id        UUID REFERENCES product_variants(id),
  movement_type     VARCHAR(30) NOT NULL,
  -- 'sale' | 'purchase' | 'adjustment' | 'waste' | 'transfer_in' | 'transfer_out' | 'return' | 'initial_count'
  quantity          DECIMAL(10,3) NOT NULL,           -- Positivo = entrada, Negativo = salida
  unit_cost         BIGINT DEFAULT 0,
  reference_type    VARCHAR(30),                      -- 'order' | 'purchase_order' | 'ai_proposal' | 'manual'
  reference_id      UUID,                             -- ID de la entidad que generó el movimiento
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- BLOQUE 5: PROVEEDORES Y ÓRDENES DE COMPRA
-- =============================================================================

CREATE TABLE suppliers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  legal_name        VARCHAR(255),
  nit               VARCHAR(20),
  contact_name      VARCHAR(255),
  email             VARCHAR(255),
  phone             VARCHAR(20),
  whatsapp          VARCHAR(20),                      -- Para envío de pedidos por WA
  address           TEXT,
  city              VARCHAR(100),
  -- Condiciones comerciales
  payment_terms_days INTEGER DEFAULT 30,
  discount_pct      DECIMAL(5,2) DEFAULT 0,
  notes             TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Órdenes de compra a proveedores
CREATE TABLE purchase_orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  order_number      VARCHAR(50) UNIQUE NOT NULL,
  status            VARCHAR(30) DEFAULT 'draft',
  -- 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  -- Totales calculados por BACKEND (nunca por IA)
  subtotal          BIGINT DEFAULT 0,
  tax_total         BIGINT DEFAULT 0,
  total             BIGINT DEFAULT 0,
  -- Origen
  source            VARCHAR(20) DEFAULT 'manual',     -- 'manual' | 'ai_suggested'
  ai_proposal_id    UUID,                             -- Si fue sugerido por IA
  notes             TEXT,
  expected_at       DATE,
  received_at       TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  sync_status       sync_status DEFAULT 'synced'
);

-- Ítems de la orden de compra
CREATE TABLE purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  variant_id        UUID REFERENCES product_variants(id),
  quantity_ordered  DECIMAL(10,3) NOT NULL,
  quantity_received DECIMAL(10,3) DEFAULT 0,
  unit_cost         BIGINT NOT NULL,
  vat_rate          DECIMAL(5,2) DEFAULT 0,
  -- Totales calculados por BACKEND
  subtotal          BIGINT DEFAULT 0,
  tax_amount        BIGINT DEFAULT 0,
  total             BIGINT DEFAULT 0
);

-- Facturas de proveedor (entrada que analiza la IA para ingreso automático)
CREATE TABLE supplier_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  supplier_id       UUID REFERENCES suppliers(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  invoice_number    VARCHAR(100),
  invoice_date      DATE,
  -- Archivo original subido por el usuario
  file_url          TEXT,                             -- URL en Supabase Storage
  file_type         VARCHAR(10),                      -- 'pdf' | 'jpg' | 'png'
  -- Estado del procesamiento por IA
  ai_processing_status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
  ai_extracted_data    JSONB,                         -- Lo que extrajo la IA (para revisión)
  ai_proposal_id    UUID,                             -- La propuesta que el usuario debe aprobar
  -- Totales (calculados por BACKEND tras aprobación)
  subtotal          BIGINT DEFAULT 0,
  tax_total         BIGINT DEFAULT 0,
  total             BIGINT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- BLOQUE 6: CLIENTES Y FIDELIZACIÓN
-- =============================================================================

CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Datos personales
  first_name        VARCHAR(100),
  last_name         VARCHAR(100),
  email             VARCHAR(255),
  phone             VARCHAR(20),
  whatsapp          VARCHAR(20),
  document_type     VARCHAR(10) DEFAULT 'CC',         -- 'CC' | 'NIT' | 'CE' | 'PAS'
  document_number   VARCHAR(30),
  birth_date        DATE,
  address           TEXT,
  city              VARCHAR(100),
  -- Segmentación
  segment           VARCHAR(30) DEFAULT 'regular',    -- 'vip' | 'regular' | 'inactive' | 'new'
  -- Fidelización
  loyalty_points    INTEGER DEFAULT 0,
  total_spent       BIGINT DEFAULT 0,                 -- Total histórico en COP
  visit_count       INTEGER DEFAULT 0,
  last_visit_at     TIMESTAMPTZ,
  -- Marketing
  accepts_marketing BOOLEAN DEFAULT TRUE,
  notes             TEXT,
  -- Datos fiscales (para factura electrónica)
  requires_invoice  BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Segmentos de clientes (para campañas de marketing por IA)
CREATE TABLE customer_segments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,            -- "Clientes inactivos 30d", "VIP"
  description       TEXT,
  -- Reglas del segmento (evaluadas por backend)
  rules             JSONB NOT NULL,
  -- {'last_visit_days_ago': {'gte': 30}, 'total_spent': {'gte': 100000}}
  customer_count    INTEGER DEFAULT 0,                -- Caché, actualizar con función
  last_evaluated_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Historial de puntos de fidelización
CREATE TABLE loyalty_transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id          UUID,                             -- Referencia a la venta
  points            INTEGER NOT NULL,                 -- Positivo = ganados, Negativo = canjeados
  reason            VARCHAR(100),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- BLOQUE 7: MESAS Y CITAS (CONFIGURACIÓN POR NICHO)
-- =============================================================================

-- Mesas (restaurant)
CREATE TABLE tables (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name              VARCHAR(50) NOT NULL,             -- "Mesa 1", "Terraza 3"
  capacity          INTEGER DEFAULT 4,
  area              VARCHAR(50),                      -- "Salón", "Terraza", "Bar"
  status            VARCHAR(20) DEFAULT 'available',  -- 'available' | 'occupied' | 'reserved' | 'cleaning'
  position_x        INTEGER DEFAULT 0,               -- Para mapa visual de mesas
  position_y        INTEGER DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE
);

-- Citas / Reservas (barbershop, workshop, restaurant)
CREATE TABLE appointments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  customer_id       UUID REFERENCES customers(id),
  staff_user_id     UUID REFERENCES users(id),        -- Barbero/técnico asignado
  table_id          UUID REFERENCES tables(id),       -- Para reservas de mesa
  -- Horario
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  -- Estado
  status            VARCHAR(20) DEFAULT 'scheduled',
  -- 'scheduled' | 'confirmed' | 'arrived' | 'in_service' | 'completed' | 'cancelled' | 'no_show'
  -- Servicios a realizar (pre-venta)
  services          JSONB DEFAULT '[]',               -- [{product_id, name, duration_min, price}]
  notes             TEXT,
  -- Recordatorio
  reminder_sent_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- BLOQUE 8: VENTAS (NÚCLEO DEL POS)
-- =============================================================================

-- Sesiones de caja
CREATE TABLE cash_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  opened_at         TIMESTAMPTZ DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  -- Dinero inicial en caja (digitado por el cajero)
  opening_cash      BIGINT DEFAULT 0,
  -- Totales (calculados por BACKEND al cerrar)
  total_sales       BIGINT DEFAULT 0,
  total_cash        BIGINT DEFAULT 0,
  total_card        BIGINT DEFAULT 0,
  total_nequi      BIGINT DEFAULT 0,
  total_daviplata   BIGINT DEFAULT 0,
  total_transfers   BIGINT DEFAULT 0,
  total_discounts   BIGINT DEFAULT 0,
  total_refunds     BIGINT DEFAULT 0,
  -- Cierre
  closing_cash      BIGINT DEFAULT 0,                 -- Efectivo contado por cajero
  cash_difference   BIGINT DEFAULT 0,                 -- Diferencia (descuadre)
  notes             TEXT,
  status            VARCHAR(20) DEFAULT 'open'        -- 'open' | 'closed'
);

-- Órdenes / Ventas (tabla central)
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  cash_session_id   UUID REFERENCES cash_sessions(id),
  order_number      VARCHAR(50) NOT NULL,
  -- Tipo de orden
  order_type        VARCHAR(20) NOT NULL DEFAULT 'sale',
  -- 'sale' | 'delivery' | 'table' | 'appointment' | 'work_order' | 'quote'
  status            VARCHAR(20) NOT NULL DEFAULT 'open',
  -- 'open' | 'in_progress' | 'ready' | 'paid' | 'cancelled' | 'refunded'
  -- Relaciones
  customer_id       UUID REFERENCES customers(id),
  staff_user_id     UUID REFERENCES users(id),        -- Vendedor/cajero
  table_id          UUID REFERENCES tables(id),
  appointment_id    UUID REFERENCES appointments(id),
  -- Totales (calculados por BACKEND, NUNCA por IA)
  subtotal          BIGINT NOT NULL DEFAULT 0,        -- Antes de IVA y descuentos
  discount_amount   BIGINT DEFAULT 0,                 -- Descuento total
  tax_total         BIGINT DEFAULT 0,                 -- IVA total
  tip_amount        BIGINT DEFAULT 0,                 -- Propina
  total             BIGINT NOT NULL DEFAULT 0,        -- Total a pagar
  -- Descuentos
  discount_type     VARCHAR(20),                      -- 'percentage' | 'fixed'
  discount_value    DECIMAL(10,2),                    -- % o valor
  discount_reason   TEXT,
  -- Soporte offline
  sync_status       sync_status DEFAULT 'synced',
  local_id          VARCHAR(100),                     -- UUID generado offline
  -- Metadata por nicho
  metadata          JSONB DEFAULT '{}',
  -- restaurant  → {'table_name': 'Mesa 3', 'guests': 4, 'waiter': 'Juan'}
  -- workshop    → {'vehicle_plate': 'ABC123', 'vehicle_brand': 'Chevrolet', 'km': 45000}
  -- delivery    → {'address': '...', 'delivery_fee': 5000, 'platform': 'rappi'}
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Ítems de la orden
CREATE TABLE order_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES products(id),
  variant_id        UUID REFERENCES product_variants(id),
  -- Snapshot del producto al momento de la venta (no depende del producto actual)
  product_name      VARCHAR(255) NOT NULL,
  product_sku       VARCHAR(100),
  -- Cantidades y precios (calculados por BACKEND)
  quantity          DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit_price        BIGINT NOT NULL,                  -- Precio unitario de venta (con IVA incluido)
  unit_cost         BIGINT DEFAULT 0,                 -- Costo al momento de venta
  vat_rate          DECIMAL(5,2) DEFAULT 0,
  vat_amount        BIGINT DEFAULT 0,
  discount_amount   BIGINT DEFAULT 0,
  subtotal          BIGINT NOT NULL,                  -- quantity * unit_price
  -- Modificadores (restaurant: sin cebolla; barbershop: con tinte; etc.)
  modifiers         JSONB DEFAULT '[]',
  notes             TEXT,
  -- Staff asignado al ítem (para comisiones en barbershop/workshop)
  staff_user_id     UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Pagos de la orden (puede haber múltiples métodos de pago)
CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method    VARCHAR(30) NOT NULL,
  -- 'cash' | 'card_debit' | 'card_credit' | 'nequi' | 'daviplata' | 'transfer' | 'loyalty_points' | 'other'
  amount            BIGINT NOT NULL,                  -- Monto pagado
  cash_received     BIGINT,                           -- Solo para efectivo
  cash_change       BIGINT,                           -- Vuelto (calculado por BACKEND)
  -- Referencia externa
  transaction_ref   VARCHAR(100),                     -- Referencia del datáfono / transferencia
  gateway           VARCHAR(30),                      -- 'wompi' | 'place_to_pay' | 'manual'
  gateway_status    VARCHAR(30),                      -- 'approved' | 'declined' | 'pending'
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Devoluciones
CREATE TABLE refunds (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID NOT NULL REFERENCES orders(id),
  amount            BIGINT NOT NULL,
  reason            TEXT NOT NULL,
  refund_method     VARCHAR(30) NOT NULL,
  approved_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- BLOQUE 9: FACTURACIÓN ELECTRÓNICA (COLOMBIA - DIAN UBL 2.1)
-- =============================================================================

CREATE TABLE electronic_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  order_id          UUID REFERENCES orders(id),
  -- Numeración DIAN
  invoice_prefix    VARCHAR(10),                      -- 'FE' | 'NC' (nota crédito)
  invoice_number    VARCHAR(20) NOT NULL,
  cufe              VARCHAR(200),                     -- Código Único de Factura Electrónica
  cude              VARCHAR(200),                     -- Para notas crédito
  invoice_type      VARCHAR(10) DEFAULT 'FV',         -- 'FV' factura venta | 'NC' nota crédito
  -- Estado
  dian_status       VARCHAR(30) DEFAULT 'pending',
  -- 'pending' | 'sending' | 'accepted' | 'rejected' | 'contingency'
  dian_response     JSONB,                            -- Respuesta completa de la DIAN
  dian_errors       JSONB,
  -- Fechas
  issued_at         TIMESTAMPTZ DEFAULT NOW(),
  sent_at           TIMESTAMPTZ,
  accepted_at       TIMESTAMPTZ,
  -- Datos del receptor
  customer_name     VARCHAR(255),
  customer_nit      VARCHAR(30),
  customer_email    VARCHAR(255),
  -- Totales (del order, calculados por BACKEND)
  subtotal          BIGINT NOT NULL DEFAULT 0,
  tax_total         BIGINT NOT NULL DEFAULT 0,
  total             BIGINT NOT NULL DEFAULT 0,
  -- XML generado
  xml_url           TEXT,                             -- URL del XML en Supabase Storage
  pdf_url           TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Configuración de facturación electrónica por organización
CREATE TABLE dian_configs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) UNIQUE,
  -- Proveedor tecnológico
  provider          VARCHAR(50),                      -- 'siigo' | 'alegra' | 'facturatech' | 'custom'
  api_key           TEXT,                             -- Encriptado en backend
  api_secret        TEXT,
  environment       VARCHAR(20) DEFAULT 'test',       -- 'test' | 'production'
  -- Resolución DIAN
  resolution_number VARCHAR(50),
  resolution_prefix VARCHAR(10),
  resolution_from   INTEGER,
  resolution_to     INTEGER,
  current_number    INTEGER DEFAULT 1,
  resolution_date   DATE,
  resolution_expires_at DATE,
  is_active         BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- BLOQUE 10: AGENTE IA - PROPUESTAS (HUMAN-IN-THE-LOOP)
-- =============================================================================
-- REGLA CRÍTICA: La IA NUNCA escribe directamente a inventory, orders, etc.
-- La IA escribe a ai_proposals con status='pending'.
-- El usuario aprueba → el backend ejecuta la acción y registra en ai_proposal_executions.

CREATE TABLE ai_proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  branch_id         UUID REFERENCES branches(id),
  -- Tipo y contenido
  proposal_type     ai_proposal_type NOT NULL,
  title             VARCHAR(255) NOT NULL,            -- Resumen humano: "Registrar 15 productos de factura Colanta"
  description       TEXT NOT NULL,                   -- Explicación detallada de por qué la IA propone esto
  -- Datos estructurados que el backend ejecutará al aprobar
  payload           JSONB NOT NULL,                   -- Los datos exactos a insertar/actualizar
  -- Confianza de la IA (0-100)
  confidence_score  INTEGER,
  -- Estado
  status            ai_proposal_status DEFAULT 'pending',
  -- Contexto
  source_type       VARCHAR(30),                      -- 'supplier_invoice' | 'sales_analysis' | 'manual_request'
  source_id         UUID,                             -- ID del recurso que originó la propuesta
  -- Resolución
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  -- TTL: propuestas vencen en 48h si no se aprueban
  expires_at        TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Log de ejecuciones de propuestas aprobadas
CREATE TABLE ai_proposal_executions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id       UUID NOT NULL REFERENCES ai_proposals(id),
  -- Resultado de la ejecución
  executed_at       TIMESTAMPTZ DEFAULT NOW(),
  success           BOOLEAN NOT NULL,
  error_message     TEXT,
  -- Qué se creó/modificó
  affected_records  JSONB,                            -- [{table: 'inventory', id: '...', action: 'update'}]
  executed_by       UUID REFERENCES users(id)         -- Backend service / usuario
);

-- Historial de interacciones con la IA (para contexto y auditoría)
CREATE TABLE ai_chat_history (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID REFERENCES users(id),
  session_id        VARCHAR(100),                     -- Agrupar mensajes de una conversación
  role              VARCHAR(10) NOT NULL,             -- 'user' | 'assistant'
  content           TEXT NOT NULL,
  -- Si el mensaje generó una propuesta
  proposal_id       UUID REFERENCES ai_proposals(id),
  -- Modelo usado
  model             VARCHAR(50),                      -- 'claude-3-5-sonnet' | 'claude-3-5-haiku'
  tokens_used       INTEGER,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- BLOQUE 11: AUDITORÍA Y SEGURIDAD
-- =============================================================================

-- Log de auditoría general (todas las acciones críticas)
CREATE TABLE audit_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID REFERENCES users(id),
  action            VARCHAR(50) NOT NULL,
  -- 'create' | 'update' | 'delete' | 'login' | 'logout' | 'cash_open' | 'cash_close' | 'refund' | 'discount'
  table_name        VARCHAR(100),
  record_id         UUID,
  old_values        JSONB,
  new_values        JSONB,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Alertas de sistema (descuadres, mermas, stock bajo)
CREATE TABLE system_alerts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  branch_id         UUID REFERENCES branches(id),
  alert_type        VARCHAR(50) NOT NULL,
  -- 'low_stock' | 'inventory_discrepancy' | 'cash_discrepancy' | 'suspicious_discount' | 'ai_anomaly'
  severity          VARCHAR(10) DEFAULT 'medium',     -- 'low' | 'medium' | 'high' | 'critical'
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  data              JSONB,                            -- Datos de soporte de la alerta
  is_read           BOOLEAN DEFAULT FALSE,
  is_resolved       BOOLEAN DEFAULT FALSE,
  resolved_by       UUID REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- BLOQUE 12: SOPORTE OFFLINE (COLA DE SINCRONIZACIÓN)
-- =============================================================================

-- Cola de operaciones pendientes de sincronizar (generadas offline)
CREATE TABLE sync_queue (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  local_id          VARCHAR(100) NOT NULL,            -- UUID generado en el cliente
  table_name        VARCHAR(100) NOT NULL,
  operation         VARCHAR(10) NOT NULL,             -- 'INSERT' | 'UPDATE' | 'DELETE'
  payload           JSONB NOT NULL,
  -- Estado de sincronización
  attempt_count     INTEGER DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ,
  error_message     TEXT,
  -- Prioridad (ventas son más críticas que reportes)
  priority          INTEGER DEFAULT 5,               -- 1=alta, 10=baja
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- ÍNDICES CRÍTICOS DE RENDIMIENTO
-- =============================================================================

-- Organizations & Branches
CREATE INDEX idx_branches_org ON branches(organization_id);

-- Products
CREATE INDEX idx_products_org ON products(organization_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_sku ON products(sku) WHERE sku IS NOT NULL;

-- Inventory
CREATE INDEX idx_inventory_branch ON inventory(branch_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_movements_branch ON inventory_movements(branch_id);
CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_date ON inventory_movements(created_at);

-- Orders
CREATE INDEX idx_orders_branch ON orders(branch_id);
CREATE INDEX idx_orders_customer ON orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_orders_session ON orders(cash_session_id);
CREATE INDEX idx_orders_date ON orders(created_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_payments_order ON payments(order_id);

-- Customers
CREATE INDEX idx_customers_org ON customers(organization_id);
CREATE INDEX idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_segment ON customers(segment);

-- AI Proposals
CREATE INDEX idx_ai_proposals_org ON ai_proposals(organization_id);
CREATE INDEX idx_ai_proposals_status ON ai_proposals(status);
CREATE INDEX idx_ai_proposals_type ON ai_proposals(proposal_type);

-- Audit
CREATE INDEX idx_audit_log_org ON audit_log(organization_id);
CREATE INDEX idx_audit_log_date ON audit_log(created_at);
CREATE INDEX idx_system_alerts_org ON system_alerts(organization_id);

-- Sync
CREATE INDEX idx_sync_queue_branch ON sync_queue(branch_id);
CREATE INDEX idx_sync_queue_synced ON sync_queue(synced_at) WHERE synced_at IS NULL;

-- Electronic invoices
CREATE INDEX idx_einvoices_org ON electronic_invoices(organization_id);
CREATE INDEX idx_einvoices_dian_status ON electronic_invoices(dian_status);


-- =============================================================================
-- ROW LEVEL SECURITY (RLS) - AISLAMIENTO MULTI-TENANT
-- =============================================================================
-- PRINCIPIO: Cada usuario solo ve datos de su organización.
-- El JWT de Supabase incluye organization_id en el claim.

-- Habilitar RLS en todas las tablas críticas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE electronic_invoices ENABLE ROW LEVEL SECURITY;

-- Función helper: extraer organization_id del JWT
CREATE OR REPLACE FUNCTION get_org_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Políticas RLS (ejemplo para tablas críticas)
-- Los owners ven toda su organización; cashiers solo su sucursal

CREATE POLICY "org_isolation" ON organizations
  FOR ALL USING (id = get_org_id());

CREATE POLICY "org_isolation" ON branches
  FOR ALL USING (organization_id = get_org_id());

CREATE POLICY "org_isolation" ON products
  FOR ALL USING (organization_id = get_org_id());

CREATE POLICY "org_isolation" ON orders
  FOR ALL USING (branch_id IN (
    SELECT id FROM branches WHERE organization_id = get_org_id()
  ));

CREATE POLICY "org_isolation" ON customers
  FOR ALL USING (organization_id = get_org_id());

CREATE POLICY "org_isolation" ON ai_proposals
  FOR ALL USING (organization_id = get_org_id());

CREATE POLICY "org_isolation" ON audit_log
  FOR ALL USING (organization_id = get_org_id());

-- Solo owners y admins pueden ver ai_proposals
CREATE POLICY "admin_only_ai_proposals" ON ai_proposals
  FOR ALL USING (
    organization_id = get_org_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );


-- =============================================================================
-- FUNCIONES Y TRIGGERS DE MANTENIMIENTO
-- =============================================================================

-- Trigger: updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger: al actualizar inventario, generar alerta si stock < min_stock
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_product products%ROWTYPE;
  v_branch branches%ROWTYPE;
BEGIN
  SELECT * INTO v_product FROM products WHERE id = NEW.product_id;
  SELECT * INTO v_branch FROM branches WHERE id = NEW.branch_id;

  IF NEW.quantity <= v_product.min_stock AND v_product.track_inventory = TRUE THEN
    INSERT INTO system_alerts (organization_id, branch_id, alert_type, severity, title, description, data)
    VALUES (
      v_branch.organization_id,
      NEW.branch_id,
      'low_stock',
      CASE WHEN NEW.quantity = 0 THEN 'critical' ELSE 'high' END,
      'Stock bajo: ' || v_product.name,
      'El producto tiene ' || NEW.quantity || ' ' || v_product.unit_of_measure || ' en inventario (mínimo: ' || v_product.min_stock || ')',
      jsonb_build_object(
        'product_id', NEW.product_id,
        'product_name', v_product.name,
        'current_qty', NEW.quantity,
        'min_stock', v_product.min_stock,
        'branch_id', NEW.branch_id
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_low_stock AFTER UPDATE OF quantity ON inventory
  FOR EACH ROW EXECUTE FUNCTION check_low_stock();

-- Trigger: al cerrar una orden, actualizar estadísticas del cliente
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.customer_id IS NOT NULL THEN
    UPDATE customers SET
      total_spent = total_spent + NEW.total,
      visit_count = visit_count + 1,
      last_visit_at = NOW(),
      segment = CASE
        WHEN total_spent + NEW.total >= 1000000 THEN 'vip'      -- 1M COP
        WHEN total_spent + NEW.total >= 200000  THEN 'regular'
        ELSE segment
      END,
      updated_at = NOW()
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_customer_stats AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_customer_stats();

-- Función: generar número de orden automático
CREATE OR REPLACE FUNCTION generate_order_number(p_branch_id UUID)
RETURNS VARCHAR AS $$
DECLARE
  v_count INTEGER;
  v_prefix VARCHAR(5);
BEGIN
  SELECT COUNT(*) + 1 INTO v_count FROM orders WHERE branch_id = p_branch_id;
  v_prefix := 'ORD';
  RETURN v_prefix || '-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(v_count::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Vista: rentabilidad por producto (para reportes de IA)
CREATE OR REPLACE VIEW v_product_profitability AS
SELECT
  p.organization_id,                                 -- REQUERIDO para filtro multi-tenant
  oi.product_id,
  p.name AS product_name,
  p.category_id,
  cat.name AS category_name,
  COUNT(DISTINCT oi.order_id) AS total_orders,
  SUM(oi.quantity) AS total_qty_sold,
  SUM(oi.subtotal) AS total_revenue,
  SUM(oi.quantity * oi.unit_cost) AS total_cost,
  SUM(oi.subtotal) - SUM(oi.quantity * oi.unit_cost) AS gross_profit,
  ROUND(
    (SUM(oi.subtotal) - SUM(oi.quantity * oi.unit_cost))::NUMERIC /
    NULLIF(SUM(oi.subtotal), 0) * 100, 2
  ) AS margin_pct
FROM order_items oi
JOIN products p ON p.id = oi.product_id
LEFT JOIN categories cat ON cat.id = p.category_id
JOIN orders o ON o.id = oi.order_id AND o.status = 'paid'
GROUP BY p.organization_id, oi.product_id, p.name, p.category_id, cat.name;

-- Vista: resumen de ventas por día (para análisis predictivo de IA)
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  o.branch_id,
  DATE(o.created_at AT TIME ZONE 'America/Bogota') AS sale_date,
  COUNT(*) AS order_count,
  SUM(o.total) AS total_revenue,
  SUM(o.discount_amount) AS total_discounts,
  AVG(o.total) AS avg_ticket,
  COUNT(DISTINCT o.customer_id) AS unique_customers
FROM orders o
WHERE o.status = 'paid'
GROUP BY o.branch_id, DATE(o.created_at AT TIME ZONE 'America/Bogota');

-- Vista: inventario con estado de stock
CREATE OR REPLACE VIEW v_inventory_status AS
SELECT
  i.branch_id,
  i.product_id,
  p.name AS product_name,
  p.sku,
  p.barcode,
  cat.name AS category_name,
  i.quantity AS current_qty,
  p.min_stock,
  i.average_cost,
  p.price,
  i.quantity * i.average_cost AS inventory_value,
  CASE
    WHEN i.quantity = 0 THEN 'out_of_stock'
    WHEN i.quantity <= p.min_stock THEN 'low_stock'
    ELSE 'ok'
  END AS stock_status
FROM inventory i
JOIN products p ON p.id = i.product_id
LEFT JOIN categories cat ON cat.id = p.category_id
WHERE p.track_inventory = TRUE AND p.is_active = TRUE;

-- =============================================================================
-- COMENTARIOS FINALES
-- =============================================================================
-- RESUMEN DE DECISIONES DE DISEÑO:
--
-- 1. BIGINT para dinero: En COP no hay decimales en transacciones cotidianas.
--    Evita errores de punto flotante. Ej: $19.000 COP = 19000 BIGINT.
--
-- 2. Snapshots en order_items: product_name, unit_price, etc. se guardan al
--    momento de la venta. Si el precio cambia después, la orden histórica
--    permanece intacta. Crítico para auditoría DIAN.
--
-- 3. ai_proposals como buffer: Garantiza el principio human-in-the-loop.
--    La IA nunca tiene permisos de escritura directa en tablas transaccionales.
--
-- 4. metadata JSONB: Permite extensibilidad sin migraciones. Cada nicho agrega
--    sus atributos propios sin alterar el esquema base.
--
-- 5. sync_queue para offline: El cliente genera UUIDs localmente y los encola.
--    Al reconectarse, el backend procesa la cola en orden de prioridad.
-- =============================================================================
