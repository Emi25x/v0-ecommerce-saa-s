-- Migrar de schema antiguo (004) a nuevo (017)
-- Este script actualiza la tabla import_schedules para usar el nuevo esquema

-- Agregar nuevas columnas si no existen
ALTER TABLE import_schedules 
ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hour INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS minute INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Migrar datos de is_active a enabled
UPDATE import_schedules 
SET enabled = is_active 
WHERE enabled IS NULL;

-- Migrar datos de time (HH:MM) a hour y minute
UPDATE import_schedules 
SET 
  hour = CAST(SPLIT_PART(time, ':', 1) AS INTEGER),
  minute = CAST(SPLIT_PART(time, ':', 2) AS INTEGER)
WHERE time IS NOT NULL AND hour = 0 AND minute = 0;

-- Eliminar columnas antiguas (opcional - comentar si quieres mantenerlas)
-- ALTER TABLE import_schedules DROP COLUMN IF EXISTS is_active;
-- ALTER TABLE import_schedules DROP COLUMN IF EXISTS time;

-- Verificar migración
SELECT 
  id,
  source_id,
  enabled,
  frequency,
  hour,
  minute,
  timezone,
  next_run_at,
  last_run_at
FROM import_schedules;
