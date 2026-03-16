-- Vincula cada fuente de importación a un almacén específico.
-- El almacén determina a qué stock_by_source key se acumula el stock importado.
-- Luego, en la config de cada cuenta ML se elige qué almacén usar para sincronizar.

ALTER TABLE import_sources
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- Índice para queries por almacén
CREATE INDEX IF NOT EXISTS idx_import_sources_warehouse
  ON import_sources(warehouse_id)
  WHERE warehouse_id IS NOT NULL;

COMMENT ON COLUMN import_sources.warehouse_id IS
  'Almacén al que alimenta esta fuente. NULL = almacén por defecto del usuario.';
