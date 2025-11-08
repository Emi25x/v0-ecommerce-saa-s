-- Agregar campo csv_separator a la tabla import_sources
ALTER TABLE import_sources 
ADD COLUMN IF NOT EXISTS csv_separator text DEFAULT ',';

-- Actualizar las fuentes existentes que usan pipe como separador
UPDATE import_sources 
SET csv_separator = '|' 
WHERE name LIKE '%Arnoia%';

-- Comentario sobre el campo
COMMENT ON COLUMN import_sources.csv_separator IS 'Separador usado en el archivo CSV: coma (,), punto y coma (;), pipe (|), o tab (\t)';
