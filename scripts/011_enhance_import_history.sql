-- Agregar campos adicionales a import_history para guardar la configuración completa de cada importación

-- Agregar columna para el mapeo de columnas usado en esta importación
ALTER TABLE import_history 
ADD COLUMN IF NOT EXISTS column_mapping JSONB;

-- Agregar columna para indicar si se actualizaron productos existentes
ALTER TABLE import_history 
ADD COLUMN IF NOT EXISTS update_existing BOOLEAN DEFAULT false;

-- Agregar columna para productos duplicados en el CSV que se combinaron
ALTER TABLE import_history 
ADD COLUMN IF NOT EXISTS products_skipped INTEGER DEFAULT 0;

-- Agregar columna para referencia al schedule si fue una importación programada
ALTER TABLE import_history 
ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES import_schedules(id) ON DELETE SET NULL;

-- Agregar columna para configuración adicional (timezone, etc.)
ALTER TABLE import_history 
ADD COLUMN IF NOT EXISTS config JSONB;

-- Agregar columna para el total de registros procesados
ALTER TABLE import_history 
ADD COLUMN IF NOT EXISTS total_records INTEGER DEFAULT 0;

-- Agregar columna para la duración de la importación en segundos
ALTER TABLE import_history 
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Crear índice para búsquedas por schedule
CREATE INDEX IF NOT EXISTS idx_import_history_schedule ON import_history(schedule_id);

-- Comentarios para documentar las columnas
COMMENT ON COLUMN import_history.column_mapping IS 'Mapeo de columnas CSV usado en esta importación';
COMMENT ON COLUMN import_history.update_existing IS 'Si se actualizaron productos existentes o solo se importaron nuevos';
COMMENT ON COLUMN import_history.products_skipped IS 'Productos duplicados en el CSV que se combinaron';
COMMENT ON COLUMN import_history.schedule_id IS 'Referencia al schedule si fue una importación programada';
COMMENT ON COLUMN import_history.config IS 'Configuración adicional (timezone, frecuencia, etc.)';
COMMENT ON COLUMN import_history.total_records IS 'Total de registros procesados del CSV';
COMMENT ON COLUMN import_history.duration_seconds IS 'Duración de la importación en segundos';
