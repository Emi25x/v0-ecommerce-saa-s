-- Agregar columnas para configuración de cronjob en import_schedules

-- Agregar columna para zona horaria
ALTER TABLE import_schedules 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Santiago';

-- Agregar columna para día de la semana (0-6, donde 0 es domingo)
ALTER TABLE import_schedules 
ADD COLUMN IF NOT EXISTS day_of_week INTEGER;

-- Agregar columna para día del mes (1-28)
ALTER TABLE import_schedules 
ADD COLUMN IF NOT EXISTS day_of_month INTEGER;

-- Agregar comentarios para documentar las columnas
COMMENT ON COLUMN import_schedules.timezone IS 'Zona horaria para la ejecución del cronjob';
COMMENT ON COLUMN import_schedules.day_of_week IS 'Día de la semana para cronjobs semanales (0=domingo, 6=sábado)';
COMMENT ON COLUMN import_schedules.day_of_month IS 'Día del mes para cronjobs mensuales (1-28)';

-- Verificar las columnas
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'import_schedules'
ORDER BY ordinal_position;
