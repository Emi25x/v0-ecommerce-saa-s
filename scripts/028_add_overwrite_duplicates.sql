-- Agregar campo para controlar si se sobrescriben productos duplicados
ALTER TABLE import_sources
ADD COLUMN IF NOT EXISTS overwrite_duplicates BOOLEAN DEFAULT false;

-- Comentario explicativo
COMMENT ON COLUMN import_sources.overwrite_duplicates IS 'Si es true, actualiza productos existentes. Si es false, solo importa productos nuevos.';
