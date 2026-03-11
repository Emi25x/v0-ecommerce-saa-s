-- ============================================================
-- 044 - Radar Editorial: tablas para tendencias de ventas
-- ============================================================

-- Vendedores de ML a monitorear para tendencias externas
CREATE TABLE IF NOT EXISTS radar_watched_sellers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   TEXT NOT NULL UNIQUE,
  nickname    TEXT NOT NULL,
  store_name  TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Snapshots diarios de sold_quantity por item de ML
-- Permite calcular δ de ventas entre períodos para categorías y vendedores externos
-- source_type: 'categoria' | 'vendedor'
-- source_id  : category_id (ej. 'MLA1144') | seller_id (ej. '123456789')
CREATE TABLE IF NOT EXISTS radar_sales_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  source_type    TEXT NOT NULL CHECK (source_type IN ('categoria', 'vendedor')),
  source_id      TEXT NOT NULL,
  ml_item_id     TEXT NOT NULL,
  title          TEXT,
  author         TEXT,
  isbn           TEXT,
  thumbnail      TEXT,
  sold_quantity  INTEGER NOT NULL DEFAULT 0,
  price          NUMERIC(10,2),
  permalink      TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (snapshot_date, source_type, source_id, ml_item_id)
);

CREATE INDEX IF NOT EXISTS idx_radar_snapshots_source_date
  ON radar_sales_snapshots (source_type, source_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_radar_snapshots_date
  ON radar_sales_snapshots (snapshot_date DESC);

COMMENT ON TABLE radar_watched_sellers  IS 'Vendedores de MercadoLibre a monitorear para tendencias del Radar Editorial.';
COMMENT ON TABLE radar_sales_snapshots  IS 'Snapshots diarios de sold_quantity de items ML por categoría/vendedor.';
