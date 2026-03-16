-- Agrega columna source_key a import_sources.
-- Esta clave corta (ej: "azeta", "arnoia", "libral") se usa como clave en products.stock_by_source.
-- Permite filtrar productos por fuente de forma confiable sin usar UUIDs con guiones en JSONB.

ALTER TABLE import_sources
  ADD COLUMN IF NOT EXISTS source_key TEXT;

-- Derivar source_key desde credentials.source_key (azeta ya lo tiene)
-- o desde la primera palabra del nombre en minúsculas
UPDATE import_sources
SET source_key = COALESCE(
  credentials->>'source_key',
  lower(split_part(name, ' ', 1))
)
WHERE source_key IS NULL;

-- Índice para búsquedas por source_key
CREATE INDEX IF NOT EXISTS idx_import_sources_source_key
  ON import_sources(source_key)
  WHERE source_key IS NOT NULL;

COMMENT ON COLUMN import_sources.source_key IS
  'Clave corta usada como key en products.stock_by_source (ej: "azeta", "arnoia", "libral"). Sin espacios ni guiones.';

-- También migrar stock_by_source existentes: renombrar keys UUID → source_key
-- (Solo aplica a productos que tengan keys UUID que no sean el source_key actual)
-- Esta migración no toca datos existentes ya que los keys UUID actualmente están vacíos ({})
-- Los imports futuros usarán el source_key directamente.
