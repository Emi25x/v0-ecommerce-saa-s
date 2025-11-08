-- Crear tabla de programaciones de importación
CREATE TABLE IF NOT EXISTS import_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES import_sources(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'custom'
  cron_expression TEXT, -- Para frecuencias personalizadas
  timezone TEXT DEFAULT 'UTC',
  hour INTEGER DEFAULT 0, -- Hora del día (0-23)
  day_of_week INTEGER, -- Para frecuencia semanal (0-6, donde 0 es domingo)
  day_of_month INTEGER, -- Para frecuencia mensual (1-31)
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índice para búsquedas rápidas por source_id
CREATE INDEX IF NOT EXISTS idx_import_schedules_source_id ON import_schedules(source_id);

-- Crear índice para búsquedas de schedules activos
CREATE INDEX IF NOT EXISTS idx_import_schedules_enabled ON import_schedules(enabled) WHERE enabled = true;

-- Mostrar las schedules creadas
SELECT 'Import schedules table created successfully' AS status;
