-- Agregar columnas de configuración al importador PRO
-- publications_scope: 'all' (default) o 'active_only'
-- activity_days: días de actividad a importar (default 30)

ALTER TABLE ml_import_progress 
ADD COLUMN IF NOT EXISTS publications_scope TEXT DEFAULT 'all' CHECK (publications_scope IN ('all', 'active_only')),
ADD COLUMN IF NOT EXISTS activity_days INTEGER DEFAULT 30 CHECK (activity_days > 0);

-- Comentarios
COMMENT ON COLUMN ml_import_progress.publications_scope IS 'Alcance de publicaciones: all (todas) o active_only (solo activas)';
COMMENT ON COLUMN ml_import_progress.activity_days IS 'Días de actividad a importar desde now()';
