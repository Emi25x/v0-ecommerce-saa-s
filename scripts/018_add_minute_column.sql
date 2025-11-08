-- Agregar columna minute a import_schedules para almacenar los minutos
ALTER TABLE import_schedules
ADD COLUMN IF NOT EXISTS minute INTEGER DEFAULT 0;

-- Actualizar registros existentes para tener minute = 0
UPDATE import_schedules
SET minute = 0
WHERE minute IS NULL;
