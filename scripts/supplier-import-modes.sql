-- Migration: Supplier import modes, stock snapshot, and import run logs
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- 1. Add import config columns to supplier_catalogs
ALTER TABLE supplier_catalogs
  ADD COLUMN IF NOT EXISTS catalog_mode    TEXT NOT NULL DEFAULT 'update_only'
                                           CHECK (catalog_mode IN ('create_only','update_only','create_and_update')),
  ADD COLUMN IF NOT EXISTS overwrite_mode  TEXT NOT NULL DEFAULT 'only_empty_fields'
                                           CHECK (overwrite_mode IN ('none','only_empty_fields','all')),
  ADD COLUMN IF NOT EXISTS warehouse_id    UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aggregation_mode TEXT NOT NULL DEFAULT 'sum'
                                           CHECK (aggregation_mode IN ('sum','replace','max'));

COMMENT ON COLUMN supplier_catalogs.catalog_mode   IS 'create_only | update_only | create_and_update';
COMMENT ON COLUMN supplier_catalogs.overwrite_mode IS 'none | only_empty_fields | all — controls which product fields get overwritten';
COMMENT ON COLUMN supplier_catalogs.warehouse_id   IS 'Almacen destino del stock de este catálogo';
COMMENT ON COLUMN supplier_catalogs.aggregation_mode IS 'Como combinar stock de este proveedor con otros (sum por defecto)';

-- 2. supplier_stock: snapshot de stock por EAN por proveedor
CREATE TABLE IF NOT EXISTS supplier_stock (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  warehouse_id  UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  ean           TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 0,
  run_id        UUID,                        -- referencia al import run que lo actualizó
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (supplier_id, ean)
);

CREATE INDEX IF NOT EXISTS idx_supplier_stock_supplier_id  ON supplier_stock(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_ean          ON supplier_stock(ean);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_warehouse_id ON supplier_stock(warehouse_id);

COMMENT ON TABLE supplier_stock IS 'Snapshot de stock por EAN por proveedor. Un upsert por corrida completa.';

-- 3. supplier_import_runs: log de cada corrida de importación
CREATE TABLE IF NOT EXISTS supplier_import_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  catalog_id         UUID REFERENCES supplier_catalogs(id) ON DELETE SET NULL,
  feed_kind          TEXT NOT NULL CHECK (feed_kind IN ('catalog','stock')),
  catalog_mode       TEXT,
  overwrite_mode     TEXT,
  warehouse_id       UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  -- Counters
  total_rows         INTEGER DEFAULT 0,
  valid_ean          INTEGER DEFAULT 0,
  created_count      INTEGER DEFAULT 0,
  updated_count      INTEGER DEFAULT 0,
  skipped_count      INTEGER DEFAULT 0,
  set_zero_stock_count INTEGER DEFAULT 0,
  error_count        INTEGER DEFAULT 0,
  -- Timing
  started_at         TIMESTAMPTZ DEFAULT NOW(),
  finished_at        TIMESTAMPTZ,
  -- Status
  status             TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  error_message      TEXT,
  -- Nuevos detectados (EAN no existentes en catalog_mode=update_only)
  new_detected_count INTEGER DEFAULT 0,
  new_detected_eans  TEXT[],
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_import_runs_supplier_id ON supplier_import_runs(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_import_runs_catalog_id  ON supplier_import_runs(catalog_id);
CREATE INDEX IF NOT EXISTS idx_supplier_import_runs_started_at  ON supplier_import_runs(started_at DESC);
