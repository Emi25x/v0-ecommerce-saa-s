-- Vincula cada fuente de importación a un almacén.
-- El stock importado se acumula en ese almacén.
-- La cuenta ML luego elige qué almacén sincronizar.

ALTER TABLE import_sources
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_import_sources_warehouse
  ON import_sources(warehouse_id)
  WHERE warehouse_id IS NOT NULL;

COMMENT ON COLUMN import_sources.warehouse_id IS
  'Almacén al que alimenta esta fuente. NULL = sin almacén específico.';
