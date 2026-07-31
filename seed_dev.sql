-- =============================================================================
-- FERZU POS — seed_dev.sql
-- Datos sintéticos: Barbería · Taller Mecánico · Minimarket
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- ⚠️  Solo para desarrollo/pruebas. No ejecutar en producción con clientes reales.
-- Seguro de ejecutar múltiples veces (usa ON CONFLICT DO NOTHING).
-- =============================================================================

-- ── PARTE 0: CREAR TABLAS FALTANTES ──────────────────────────────────────────
-- Estas tablas son requeridas por WorkshopPage.jsx y MinimarketPage.jsx
-- y no están en schema_v2.sql. Se crean solo si no existen.

CREATE TABLE IF NOT EXISTS work_orders (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id         UUID NOT NULL REFERENCES branches(id),
  vehicle_plate     TEXT NOT NULL,
  vehicle_brand     TEXT,
  vehicle_model     TEXT,
  vehicle_year      INTEGER,
  vehicle_color     TEXT,
  vehicle_km        BIGINT,
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT,
  services_summary  TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','diagnosing','approved','in_progress','ready','delivered','cancelled')),
  budget_total      BIGINT NOT NULL DEFAULT 0,
  received_at       TIMESTAMPTZ DEFAULT NOW(),
  diagnosing_at     TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  in_progress_at    TIMESTAMPTZ,
  ready_at          TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_order_items (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'labor' CHECK (type IN ('labor','part')),
  qty            INTEGER NOT NULL DEFAULT 1,
  unit_price     BIGINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_batches (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id        UUID NOT NULL REFERENCES branches(id),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_number     TEXT,
  quantity         DECIMAL(10,3) NOT NULL DEFAULT 0,
  cost_per_unit    BIGINT DEFAULT 0,
  expiry_date      DATE,
  manufacture_date DATE,
  supplier_id      UUID REFERENCES suppliers(id),
  status           TEXT DEFAULT 'active' CHECK (status IN ('active','expired','removed')),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE work_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_batches  ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_work_orders_branch   ON work_orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_plate    ON work_orders(organization_id, vehicle_plate);
CREATE INDEX IF NOT EXISTS idx_batches_branch       ON product_batches(branch_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry       ON product_batches(expiry_date) WHERE status = 'active';


-- ── PARTE 1: SEED DE DATOS SINTÉTICOS ────────────────────────────────────────

DO $$
DECLARE
  v_org    UUID;
  v_branch UUID;

  -- UUIDs fijos para poder re-ejecutar sin duplicar
  -- Barbería — categorías
  cat_cortes  UUID := 'c0000001-0000-0000-0000-000000000001';
  cat_barba   UUID := 'c0000001-0000-0000-0000-000000000002';
  cat_spa     UUID := 'c0000001-0000-0000-0000-000000000003';

  -- Barbería — servicios (products con item_type='service')
  svc_corte   UUID := 'p0000001-0000-0000-0000-000000000001';
  svc_barba   UUID := 'p0000001-0000-0000-0000-000000000002';
  svc_combo   UUID := 'p0000001-0000-0000-0000-000000000003';
  svc_tintura UUID := 'p0000001-0000-0000-0000-000000000004';
  svc_cejas   UUID := 'p0000001-0000-0000-0000-000000000005';

  -- Clientes barbería
  cb1 UUID := 'e0000001-0000-0000-0000-000000000001';
  cb2 UUID := 'e0000001-0000-0000-0000-000000000002';
  cb3 UUID := 'e0000001-0000-0000-0000-000000000003';
  cb4 UUID := 'e0000001-0000-0000-0000-000000000004';

  -- Taller — clientes
  ct1 UUID := 'e0000002-0000-0000-0000-000000000001';
  ct2 UUID := 'e0000002-0000-0000-0000-000000000002';
  ct3 UUID := 'e0000002-0000-0000-0000-000000000003';

  -- Taller — work orders
  wo1 UUID := 'f0000001-0000-0000-0000-000000000001';
  wo2 UUID := 'f0000001-0000-0000-0000-000000000002';
  wo3 UUID := 'f0000001-0000-0000-0000-000000000003';
  wo4 UUID := 'f0000001-0000-0000-0000-000000000004';
  wo5 UUID := 'f0000001-0000-0000-0000-000000000005';
  wo6 UUID := 'f0000001-0000-0000-0000-000000000006';

  -- Minimarket — proveedores
  sup_ali  UUID := 'd0000001-0000-0000-0000-000000000001';
  sup_bev  UUID := 'd0000001-0000-0000-0000-000000000002';
  sup_aseo UUID := 'd0000001-0000-0000-0000-000000000003';

  -- Minimarket — categorías
  cat_bebidas  UUID := 'c0000002-0000-0000-0000-000000000001';
  cat_snacks   UUID := 'c0000002-0000-0000-0000-000000000002';
  cat_lacteos  UUID := 'c0000002-0000-0000-0000-000000000003';
  cat_aseo_m   UUID := 'c0000002-0000-0000-0000-000000000004';
  cat_granos   UUID := 'c0000002-0000-0000-0000-000000000005';

  -- Minimarket — productos
  prd_agua    UUID := 'b0000001-0000-0000-0000-000000000001';
  prd_gaseosa UUID := 'b0000001-0000-0000-0000-000000000002';
  prd_jugo    UUID := 'b0000001-0000-0000-0000-000000000003';
  prd_leche   UUID := 'b0000001-0000-0000-0000-000000000004';
  prd_yogurt  UUID := 'b0000001-0000-0000-0000-000000000005';
  prd_queso   UUID := 'b0000001-0000-0000-0000-000000000006';
  prd_carne   UUID := 'b0000001-0000-0000-0000-000000000007';
  prd_papas   UUID := 'b0000001-0000-0000-0000-000000000008';
  prd_choco   UUID := 'b0000001-0000-0000-0000-000000000009';
  prd_jabon   UUID := 'b0000001-0000-0000-0000-000000000010';
  prd_arroz   UUID := 'b0000001-0000-0000-0000-000000000011';
  prd_lentej  UUID := 'b0000001-0000-0000-0000-000000000012';

BEGIN
  -- Detectar org y branch del usuario actual
  SELECT id INTO v_org FROM organizations LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No hay organizaciones. Completa el onboarding primero.';
  END IF;

  SELECT id INTO v_branch FROM branches WHERE organization_id = v_org LIMIT 1;
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'No hay sucursales en la organización.';
  END IF;

  RAISE NOTICE '── Usando organización: % / sucursal: %', v_org, v_branch;

  -- ================================================================
  -- MÓDULO BARBERÍA
  -- ================================================================
  RAISE NOTICE '── Insertando datos de Barbería...';

  -- Categorías
  INSERT INTO categories (id, organization_id, name, color, icon, sort_order)
  VALUES
    (cat_cortes, v_org, 'Cortes de cabello', '#059669', 'scissors', 10),
    (cat_barba,  v_org, 'Barba y afeitado',  '#0891b2', 'feather',  11),
    (cat_spa,    v_org, 'Spa y tratamientos','#7c3aed', 'sparkles', 12)
  ON CONFLICT (id) DO NOTHING;

  -- Servicios (products con item_type='service', sin inventario)
  INSERT INTO products (id, organization_id, category_id, name, item_type,
                        price, cost, vat_rate, vat_included, track_inventory,
                        description, is_active, metadata)
  VALUES
    (svc_corte,   v_org, cat_cortes, 'Corte de cabello clásico',     'service', 25000, 0, 0, true, false,
     'Corte con tijera o máquina. Incluye lavado y secado.', true, '{"duration_min":30}'),
    (svc_barba,   v_org, cat_barba,  'Afeitado clásico con navaja',  'service', 20000, 0, 0, true, false,
     'Afeitado tradicional con vapor, espuma y toalla caliente.', true, '{"duration_min":25}'),
    (svc_combo,   v_org, cat_cortes, 'Combo corte + barba',          'service', 40000, 0, 0, true, false,
     'Corte completo más arreglo y diseño de barba.', true, '{"duration_min":50}'),
    (svc_tintura, v_org, cat_spa,    'Tintura / Coloración',         'service', 65000, 15000, 0, true, false,
     'Coloración completa con productos profesionales Wella.', true, '{"duration_min":90}'),
    (svc_cejas,   v_org, cat_spa,    'Diseño de cejas',              'service', 15000, 0, 0, true, false,
     'Perfilado y depilación con hilo o cera caliente.', true, '{"duration_min":20}')
  ON CONFLICT (id) DO NOTHING;

  -- Clientes barbería
  INSERT INTO customers (id, organization_id, first_name, last_name, phone, whatsapp,
                         document_type, document_number, segment, loyalty_points,
                         total_spent, visit_count, notes, is_active)
  VALUES
    (cb1, v_org, 'Andrés',   'Martínez',  '3112345678', '3112345678',
     'CC', '1098765432', 'vip',     150, 450000, 12, 'Cliente fijo viernes. Prefiere barba larga.', true),
    (cb2, v_org, 'Carlos',   'Rodríguez', '3204567890', '3204567890',
     'CC', '1087654321', 'regular', 40,  120000, 4,  'Fade bajo #1 a los lados.', true),
    (cb3, v_org, 'Santiago', 'López',     '3156789012', '3156789012',
     'CC', '1076543210', 'regular', 20,  65000,  2,  NULL, true),
    (cb4, v_org, 'Miguel',   'Torres',    '3009876543', '3009876543',
     'CC', '1065432109', 'nuevo',   0,   25000,  1,  'Referido de Andrés Martínez.', true)
  ON CONFLICT (id) DO NOTHING;

  -- Citas: pasadas (completed/cancelled) + futuras (scheduled)
  INSERT INTO appointments (id, branch_id, customer_id, start_at, end_at, status, services, notes)
  VALUES
    -- Pasadas completadas
    (gen_random_uuid(), v_branch, cb1,
     NOW() - INTERVAL '6 days 10 hours', NOW() - INTERVAL '6 days 9 hours 30 min',
     'completed', '[{"name":"Corte de cabello clásico","price":25000,"duration_min":30}]',
     'Llegó puntual'),
    (gen_random_uuid(), v_branch, cb1,
     NOW() - INTERVAL '13 days 11 hours', NOW() - INTERVAL '13 days 10 hours',
     'completed', '[{"name":"Combo corte + barba","price":40000,"duration_min":50}]',
     NULL),
    (gen_random_uuid(), v_branch, cb2,
     NOW() - INTERVAL '3 days 14 hours', NOW() - INTERVAL '3 days 13 hours 30 min',
     'completed', '[{"name":"Corte de cabello clásico","price":25000,"duration_min":30}]',
     NULL),
    (gen_random_uuid(), v_branch, cb4,
     NOW() - INTERVAL '10 days 9 hours', NOW() - INTERVAL '10 days 8 hours 30 min',
     'completed', '[{"name":"Tintura / Coloración","price":65000,"duration_min":90}]',
     'Primera tintura — quedó muy bien'),
    -- Cancelada (sin presentarse)
    (gen_random_uuid(), v_branch, cb3,
     NOW() - INTERVAL '1 day 9 hours', NOW() - INTERVAL '1 day 8 hours 40 min',
     'cancelled', '[{"name":"Afeitado clásico con navaja","price":20000,"duration_min":25}]',
     'No se presentó sin avisar'),
    -- Futuras programadas
    (gen_random_uuid(), v_branch, cb1,
     NOW() + INTERVAL '1 day 10 hours', NOW() + INTERVAL '1 day 10 hours 50 min',
     'scheduled', '[{"name":"Combo corte + barba","price":40000,"duration_min":50}]',
     'Viernes fijo'),
    (gen_random_uuid(), v_branch, cb2,
     NOW() + INTERVAL '2 days 14 hours', NOW() + INTERVAL '2 days 14 hours 30 min',
     'scheduled', '[{"name":"Corte de cabello clásico","price":25000,"duration_min":30}]',
     NULL),
    (gen_random_uuid(), v_branch, cb4,
     NOW() + INTERVAL '3 days 11 hours', NOW() + INTERVAL '3 days 12 hours 30 min',
     'scheduled', '[{"name":"Tintura / Coloración","price":65000,"duration_min":90}]',
     'Retoque color anterior'),
    (gen_random_uuid(), v_branch, cb3,
     NOW() + INTERVAL '5 days 9 hours', NOW() + INTERVAL '5 days 9 hours 20 min',
     'scheduled', '[{"name":"Diseño de cejas","price":15000,"duration_min":20}]',
     NULL)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '   ✅ Barbería OK — 5 servicios, 4 clientes, 9 citas (4 pasadas, 1 cancelada, 4 futuras)';


  -- ================================================================
  -- MÓDULO TALLER MECÁNICO
  -- ================================================================
  RAISE NOTICE '── Insertando datos de Taller...';

  -- Clientes taller
  INSERT INTO customers (id, organization_id, first_name, last_name, phone, whatsapp,
                         document_type, document_number, notes, is_active)
  VALUES
    (ct1, v_org, 'Jorge',    'Herrera',  '3001112233', '3001112233',
     'CC', '79654321', 'Tiene Mazda CX-5 2019 y moto Yamaha. Paga tarjeta.', true),
    (ct2, v_org, 'Patricia', 'Gómez',    '3142223344', '3142223344',
     'CC', '52876543', 'Solo paga en efectivo. Chevrolet Spark.', true),
    (ct3, v_org, 'Ricardo',  'Peña',     '3183334455', '3183334455',
     'CC', '91234567', 'Taxista. Cliente frecuente — Toyota Corolla 2017.', true)
  ON CONFLICT (id) DO NOTHING;

  -- Órdenes de trabajo (una por cada columna del Kanban)
  INSERT INTO work_orders (id, organization_id, branch_id,
                           vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, vehicle_color, vehicle_km,
                           customer_name, customer_phone, services_summary, notes,
                           status, budget_total,
                           received_at, diagnosing_at, approved_at, in_progress_at, ready_at, delivered_at)
  VALUES
    -- delivered (entregado — historial)
    (wo1, v_org, v_branch,
     'BCD-123', 'Mazda', 'CX-5', 2019, 'Gris', 85000,
     'Jorge Herrera', '3001112233', 'Cambio de aceite sintético + filtro de aire', NULL,
     'delivered', 120000,
     NOW()-INTERVAL '15 days', NOW()-INTERVAL '14 days 22 h', NOW()-INTERVAL '14 days 20 h',
     NOW()-INTERVAL '14 days 18 h', NOW()-INTERVAL '13 days', NOW()-INTERVAL '12 days'),

    -- in_progress (en taller)
    (wo2, v_org, v_branch,
     'EFG-456', 'Chevrolet', 'Spark GT', 2020, 'Blanco', 42000,
     'Patricia Gómez', '3142223344', 'Revisión y cambio de pastillas de freno', NULL,
     'in_progress', 280000,
     NOW()-INTERVAL '3 days', NOW()-INTERVAL '2 days 22 h', NOW()-INTERVAL '2 days 20 h',
     NOW()-INTERVAL '2 days 18 h', NULL, NULL),

    -- diagnosing (diagnóstico)
    (wo3, v_org, v_branch,
     'HIJ-789', 'Toyota', 'Corolla', 2017, 'Rojo', 128000,
     'Ricardo Peña', '3183334455', 'Luz check engine — sistema eléctrico', 'Posible sensor O2',
     'diagnosing', 0,
     NOW()-INTERVAL '1 day', NOW()-INTERVAL '20 hours', NULL, NULL, NULL, NULL),

    -- received (recibido — nuevo)
    (wo4, v_org, v_branch,
     'KLM-012', 'Renault', 'Sandero', 2021, 'Azul', 31000,
     'Jorge Herrera', '3001112233', 'Cambio de 4 llantas + alineación', NULL,
     'received', 580000,
     NOW()-INTERVAL '2 hours', NULL, NULL, NULL, NULL, NULL),

    -- approved (aprobado — esperando empezar)
    (wo5, v_org, v_branch,
     'NOP-345', 'Kia', 'Picanto', 2018, 'Negro', 76500,
     'Luis Cardona', '3221234567', 'Servicio de los 60.000 km completo', NULL,
     'approved', 350000,
     NOW()-INTERVAL '2 days', NOW()-INTERVAL '1 day 22 h', NOW()-INTERVAL '1 day 20 h',
     NULL, NULL, NULL),

    -- ready (listo para retirar)
    (wo6, v_org, v_branch,
     'QRS-678', 'Yamaha', 'FZ 150i', 2022, 'Negro', 18000,
     'Ricardo Peña', '3183334455', 'Kit de arrastre + frenos delantero y trasero', NULL,
     'ready', 185000,
     NOW()-INTERVAL '5 days', NOW()-INTERVAL '4 days 22 h', NOW()-INTERVAL '4 days 20 h',
     NOW()-INTERVAL '4 days 18 h', NOW()-INTERVAL '1 day', NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Ítems de cada orden (repuestos y mano de obra)
  INSERT INTO work_order_items (work_order_id, description, type, qty, unit_price) VALUES
    -- WO1 — Cambio de aceite (delivered)
    (wo1, 'Aceite sintético 5W-30 (4 litros)',       'part',  1, 80000),
    (wo1, 'Filtro de aceite Mazda',                  'part',  1, 18000),
    (wo1, 'Filtro de aire',                          'part',  1, 22000),
    (wo1, 'Mano de obra — cambio de aceite',         'labor', 1,     0),
    -- WO2 — Frenos (in_progress)
    (wo2, 'Pastillas de freno delanteras Bosch',     'part',  1, 85000),
    (wo2, 'Pastillas de freno traseras Bosch',       'part',  1, 75000),
    (wo2, 'Líquido de frenos DOT4 (500 ml)',         'part',  1, 28000),
    (wo2, 'Mano de obra — revisión y cambio frenos', 'labor', 1, 92000),
    -- WO3 — Eléctrico (diagnosing)
    (wo3, 'Diagnóstico OBD II sistema eléctrico',    'labor', 1, 45000),
    (wo3, 'Sensor de oxígeno (pend. aprobación)',    'part',  1, 85000),
    -- WO4 — Llantas (received)
    (wo4, 'Llanta Michelin Energy XM2 195/65 R15',  'part',  4, 115000),
    (wo4, 'Alineación y balanceo 4 ruedas',          'labor', 1, 40000),
    (wo4, 'Válvulas de neumático',                   'part',  4,  3000),
    -- WO5 — Servicio 60k (approved)
    (wo5, 'Aceite sintético + filtros completos',    'labor', 1, 110000),
    (wo5, 'Bujías NGK x4',                          'part',  4, 18000),
    (wo5, 'Correa de distribución',                  'part',  1, 85000),
    (wo5, 'Revisión sistema de frenos',              'labor', 1, 65000),
    -- WO6 — Kit arrastre moto (ready)
    (wo6, 'Kit arrastre catalina + piñón + cadena', 'part',  1, 120000),
    (wo6, 'Pastillas freno delantero moto',         'part',  1, 28000),
    (wo6, 'Pastillas freno trasero moto',           'part',  1, 25000),
    (wo6, 'Mano de obra — instalación kit',         'labor', 1, 12000)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '   ✅ Taller OK — 3 clientes, 6 órdenes (1 por columna Kanban), 20 ítems';


  -- ================================================================
  -- MÓDULO MINIMARKET
  -- ================================================================
  RAISE NOTICE '── Insertando datos de Minimarket...';

  -- Proveedores
  INSERT INTO suppliers (id, organization_id, name, nit, contact_name, phone, whatsapp, payment_terms_days, is_active)
  VALUES
    (sup_ali,  v_org, 'Distribuidora La Cosecha SAS', '800123456-1', 'Carlos Nieto',   '6017654321', '3101234567', 15, true),
    (sup_bev,  v_org, 'Bavaria Distribuciones',       '890176430-2', 'Ana Ramírez',    '6019876543', '3209876543', 30, true),
    (sup_aseo, v_org, 'Proveaseo Colombia SAS',       '900234567-3', 'Luis Figueroa',  '6012345678', '3152345678', 30, true)
  ON CONFLICT (id) DO NOTHING;

  -- Categorías minimarket
  INSERT INTO categories (id, organization_id, name, color, icon, sort_order)
  VALUES
    (cat_bebidas, v_org, 'Bebidas',         '#0891b2', 'droplets', 20),
    (cat_snacks,  v_org, 'Snacks y dulces', '#f59e0b', 'cookie',   21),
    (cat_lacteos, v_org, 'Lácteos',         '#10b981', 'milk',     22),
    (cat_aseo_m,  v_org, 'Aseo y limpieza', '#8b5cf6', 'sparkles', 23),
    (cat_granos,  v_org, 'Granos y granel', '#d97706', 'wheat',    24)
  ON CONFLICT (id) DO NOTHING;

  -- Productos minimarket
  INSERT INTO products (id, organization_id, category_id, name, sku, barcode,
                        price, cost, vat_rate, vat_included, track_inventory,
                        unit_of_measure, min_stock, is_active, metadata)
  VALUES
    -- Bebidas
    (prd_agua,    v_org, cat_bebidas, 'Agua Cristal 600ml',            'AGU-600',  '7702001530657', 1800,  900,   0,  true, true, 'unit', 24, true, '{}'),
    (prd_gaseosa, v_org, cat_bebidas, 'Coca-Cola 400ml',               'CCO-400',  '5449000000439', 2500,  1200, 19,  true, true, 'unit', 24, true, '{}'),
    (prd_jugo,    v_org, cat_bebidas, 'Hit Mango 300ml',               'HIT-MAN',  '7702001612030', 2200,  1000,  0,  true, true, 'unit', 12, true, '{}'),
    -- Lácteos
    (prd_leche,   v_org, cat_lacteos, 'Leche Alquería Entera 1L',      'ALQ-1L',   '7707213020123', 3500,  2400,  0,  true, true, 'unit', 10, true, '{}'),
    (prd_yogurt,  v_org, cat_lacteos, 'Yogurt Alpina Fresa 200g',      'ALP-FRE',  '7702000000211', 2800,  1600,  0,  true, true, 'unit',  6, true, '{}'),
    -- Por peso (kg) — para balanza
    (prd_queso,   v_org, cat_lacteos, 'Queso campesino (x kg)',        'QSO-KG',   NULL,           22000, 14000,  0,  true, true, 'kg',    1, true, '{"price_per_kg":22000}'),
    (prd_carne,   v_org, cat_lacteos, 'Carne molida de res (x kg)',    'CRN-KG',   NULL,           28000, 18000,  0,  true, true, 'kg',    2, true, '{"price_per_kg":28000}'),
    -- Snacks
    (prd_papas,   v_org, cat_snacks,  'Papas Margarita 100g',          'PAP-100',  '7702184000102', 2600,  1400,  0,  true, true, 'unit', 12, true, '{}'),
    (prd_choco,   v_org, cat_snacks,  'Chocolate Jet 200g',            'CHO-JET',  '7702001340057', 4500,  2800,  0,  true, true, 'unit',  6, true, '{}'),
    -- Aseo
    (prd_jabon,   v_org, cat_aseo_m,  'Jabón manos Protex 200ml',     'JAB-PRO',  '7501032311516', 8500,  5500, 19,  true, true, 'unit',  4, true, '{}'),
    -- Granos a granel — balanza
    (prd_arroz,   v_org, cat_granos,  'Arroz blanco (x kg)',           'ARR-KG',   NULL,            4200,  2800,  0,  true, true, 'kg',    5, true, '{"price_per_kg":4200}'),
    (prd_lentej,  v_org, cat_granos,  'Lentejas verdes (x kg)',        'LEN-KG',   NULL,            6500,  4000,  0,  true, true, 'kg',    3, true, '{"price_per_kg":6500}')
  ON CONFLICT (id) DO NOTHING;

  -- Inventario inicial
  INSERT INTO inventory (branch_id, product_id, quantity, min_stock, average_cost, last_cost)
  VALUES
    (v_branch, prd_agua,    48,   24, 900,   900),
    (v_branch, prd_gaseosa, 36,   24, 1200, 1200),
    (v_branch, prd_jugo,    24,   12, 1000, 1000),
    (v_branch, prd_leche,   15,   10, 2400, 2400),
    (v_branch, prd_yogurt,  10,    6, 1600, 1600),
    (v_branch, prd_queso,   4.5,   1,14000,14000),
    (v_branch, prd_carne,   6.0,   2,18000,18000),
    (v_branch, prd_papas,   30,   12, 1400, 1400),
    (v_branch, prd_choco,    8,    6, 2800, 2800),
    (v_branch, prd_jabon,    4,    4, 5500, 5500),
    (v_branch, prd_arroz,  12.5,   5, 2800, 2800),
    (v_branch, prd_lentej,  5.0,   3, 4000, 4000)
  ON CONFLICT (branch_id, product_id) DO UPDATE
    SET quantity     = EXCLUDED.quantity,
        average_cost = EXCLUDED.average_cost;

  -- Lotes con fechas de vencimiento (ExpiryTracker + BatchManager)
  INSERT INTO product_batches (organization_id, branch_id, product_id, batch_number,
                               quantity, cost_per_unit, expiry_date, supplier_id, status)
  VALUES
    -- ✅ Vigentes — sin problema
    (v_org, v_branch, prd_agua,    'CRI-2026-12', 48,  900,   CURRENT_DATE + 180, sup_bev,  'active'),
    (v_org, v_branch, prd_gaseosa, 'CCO-2026-09', 36, 1200,   CURRENT_DATE + 90,  sup_bev,  'active'),
    (v_org, v_branch, prd_papas,   'MAR-2026-08', 30, 1400,   CURRENT_DATE + 45,  sup_ali,  'active'),
    (v_org, v_branch, prd_choco,   'JET-2026-10',  8, 2800,   CURRENT_DATE + 120, sup_ali,  'active'),
    (v_org, v_branch, prd_jabon,   'PRO-2026-11',  4, 5500,   CURRENT_DATE + 365, sup_aseo, 'active'),
    (v_org, v_branch, prd_arroz,   'ARR-2026-11',  12.5, 2800, NULL,              sup_ali,  'active'),
    -- ⚠️  Próximos a vencer (≤ 7 días — amarillo en ExpiryTracker)
    (v_org, v_branch, prd_leche,   'ALQ-2026-07A', 3, 2400,   CURRENT_DATE + 2,   sup_ali,  'active'),
    (v_org, v_branch, prd_jugo,    'HIT-2026-07B',12, 1000,   CURRENT_DATE + 5,   sup_ali,  'active'),
    (v_org, v_branch, prd_yogurt,  'ALP-2026-07A',  4, 1600,  CURRENT_DATE + 6,   sup_ali,  'active'),
    (v_org, v_branch, prd_queso,   'QSO-2026-07C',  2, 14000, CURRENT_DATE + 4,   sup_ali,  'active'),
    -- 🔴 Vencidos — para probar flujo "Dar de baja"
    (v_org, v_branch, prd_leche,   'ALQ-2026-06X',  2, 2400,  CURRENT_DATE - 3,   sup_ali,  'active'),
    (v_org, v_branch, prd_yogurt,  'ALP-2026-06X',  3, 1600,  CURRENT_DATE - 1,   sup_ali,  'active'),
    (v_org, v_branch, prd_carne,   'CRN-2026-07X', 1.5,18000, CURRENT_DATE - 2,   sup_ali,  'active')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '   ✅ Minimarket OK — 3 proveedores, 5 categorías, 12 productos, inventario, 13 lotes';


  -- ================================================================
  -- RESUMEN FINAL
  -- ================================================================
  RAISE NOTICE '';
  RAISE NOTICE '🎉 seed_dev.sql completado.';
  RAISE NOTICE '   Organización : %', v_org;
  RAISE NOTICE '   Sucursal     : %', v_branch;
  RAISE NOTICE '';
  RAISE NOTICE '   Módulo Barbería  → /barbershop';
  RAISE NOTICE '     • 3 categorías de servicio';
  RAISE NOTICE '     • 5 servicios (corte, barba, combo, tintura, cejas)';
  RAISE NOTICE '     • 4 clientes (1 VIP, 2 regular, 1 nuevo)';
  RAISE NOTICE '     • 9 citas (4 pasadas, 1 cancelada, 4 futuras)';
  RAISE NOTICE '';
  RAISE NOTICE '   Módulo Taller    → /workshop';
  RAISE NOTICE '     • 3 clientes';
  RAISE NOTICE '     • 6 órdenes de trabajo (1 por columna Kanban)';
  RAISE NOTICE '     • 20 ítems (repuestos + mano de obra)';
  RAISE NOTICE '';
  RAISE NOTICE '   Módulo Minimarket → /minimarket';
  RAISE NOTICE '     • 3 proveedores';
  RAISE NOTICE '     • 5 categorías (bebidas, snacks, lácteos, aseo, granos)';
  RAISE NOTICE '     • 12 productos (4 vendidos por kg para balanza)';
  RAISE NOTICE '     • Inventario inicial cargado';
  RAISE NOTICE '     • 13 lotes: 6 vigentes, 4 próximos a vencer, 3 vencidos';
END $$;
