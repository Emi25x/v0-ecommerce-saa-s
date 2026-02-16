-- Agregar columna scroll_id para scroll pagination de ML
ALTER TABLE ml_import_progress
ADD COLUMN IF NOT EXISTS scroll_id TEXT;

COMMENT ON COLUMN ml_import_progress.scroll_id IS 'Scroll ID de MercadoLibre para paginación continua sin offset';
