-- Vincular fuente de importación a cuenta ML específica
-- y agregar source_key para identificar la fuente en stock_by_source

ALTER TABLE import_sources
  ADD COLUMN IF NOT EXISTS ml_account_id UUID REFERENCES ml_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_key    TEXT; -- clave en stock_by_source, ej: "arg_stock"

-- Generar source_key automáticamente a partir del nombre si no está seteado
UPDATE import_sources
SET source_key = LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '_', 'g'))
WHERE source_key IS NULL;

-- Índice para queries por cuenta ML
CREATE INDEX IF NOT EXISTS idx_import_sources_ml_account
  ON import_sources(ml_account_id)
  WHERE ml_account_id IS NOT NULL;

COMMENT ON COLUMN import_sources.ml_account_id IS
  'Cuenta ML a la que alimenta esta fuente. NULL = todas las cuentas.';
COMMENT ON COLUMN import_sources.source_key IS
  'Clave usada en products.stock_by_source para aislar stock por fuente.';
