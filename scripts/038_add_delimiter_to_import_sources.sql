-- Agregar columna delimiter a import_sources
-- Esta columna es leída por /api/inventory/import/batch para parsear CSVs

ALTER TABLE import_sources 
ADD COLUMN IF NOT EXISTS delimiter TEXT DEFAULT NULL;

COMMENT ON COLUMN import_sources.delimiter IS 'Delimiter del CSV: "|", ";", ",", etc. NULL = auto-detect';

-- Configurar delimiters conocidos para fuentes existentes
UPDATE import_sources
SET delimiter = '|'
WHERE name ILIKE '%azeta%' AND (name ILIKE '%total%' OR name ILIKE '%catalogo%' OR name ILIKE '%parcial%');

UPDATE import_sources
SET delimiter = ';'
WHERE name ILIKE '%azeta%' AND name ILIKE '%stock%';

UPDATE import_sources
SET delimiter = ';'
WHERE name ILIKE '%arnoia%';

-- Verificación
SELECT 
  id,
  name,
  delimiter,
  auth_type,
  is_active
FROM import_sources
ORDER BY name;
