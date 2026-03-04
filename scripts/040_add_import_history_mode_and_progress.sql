-- Migración: Agregar columnas faltantes a import_history para soportar progreso por batches
-- Ejecutar en Supabase SQL Editor

ALTER TABLE public.import_history 
ADD COLUMN IF NOT EXISTS mode text,
ADD COLUMN IF NOT EXISTS current_offset integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS batch_size integer DEFAULT 1000,
ADD COLUMN IF NOT EXISTS processed_rows integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS skipped_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_rows integer,
ADD COLUMN IF NOT EXISTS last_message text;

-- Crear índice para búsquedas rápidas por source_id y status
CREATE INDEX IF NOT EXISTS idx_import_history_source_status ON public.import_history(source_id, status);

-- Comentarios
COMMENT ON COLUMN public.import_history.mode IS 'Modo de importación: create, update, create_update, stock_only';
COMMENT ON COLUMN public.import_history.current_offset IS 'Offset actual del batch en progreso';
COMMENT ON COLUMN public.import_history.batch_size IS 'Tamaño del batch (ej: 1000 filas)';
COMMENT ON COLUMN public.import_history.processed_rows IS 'Total de filas procesadas hasta ahora';
COMMENT ON COLUMN public.import_history.created_count IS 'Contador de productos creados';
COMMENT ON COLUMN public.import_history.updated_count IS 'Contador de productos actualizados';
COMMENT ON COLUMN public.import_history.skipped_count IS 'Contador de filas descartadas';
COMMENT ON COLUMN public.import_history.error_count IS 'Contador de errores';
COMMENT ON COLUMN public.import_history.total_rows IS 'Total de filas del CSV (null si desconocido)';
COMMENT ON COLUMN public.import_history.last_message IS 'Último mensaje de estado o error';
