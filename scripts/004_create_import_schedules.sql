-- Tabla para programar importaciones automáticas
CREATE TABLE IF NOT EXISTS import_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES import_sources(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('once', 'daily', 'weekly', 'monthly')),
  time TEXT NOT NULL, -- Formato HH:MM (24 horas)
  day_of_week INTEGER, -- 0-6 para semanal (0 = domingo)
  day_of_month INTEGER, -- 1-31 para mensual
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_import_schedules_source ON import_schedules(source_id);
CREATE INDEX IF NOT EXISTS idx_import_schedules_next_run ON import_schedules(next_run_at) WHERE is_active = true;

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_import_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at automáticamente
DROP TRIGGER IF EXISTS update_import_schedules_updated_at ON import_schedules;
CREATE TRIGGER update_import_schedules_updated_at
  BEFORE UPDATE ON import_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_import_schedules_updated_at();
