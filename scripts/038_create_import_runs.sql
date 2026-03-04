-- Crear tabla import_runs para gestionar ejecuciones de importación PRO
-- Esta tabla permite importaciones resumibles, cancelables, sin re-descargar CSV

CREATE TABLE IF NOT EXISTS import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES import_sources(id) ON DELETE CASCADE,
  
  -- Configuración del run
  feed_kind TEXT NOT NULL CHECK (feed_kind IN ('catalog', 'stock', 'updates')),
  mode TEXT NOT NULL CHECK (mode IN ('create', 'update', 'upsert')),
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed', 'canceled')),
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ DEFAULT now(),
  
  -- Storage del CSV descargado
  storage_path TEXT,
  bytes BIGINT,
  checksum TEXT,
  
  -- Progreso
  total_rows INTEGER,
  processed_rows INTEGER DEFAULT 0,
  
  -- Contadores
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_missing_key INTEGER DEFAULT 0,
  skipped_invalid_key INTEGER DEFAULT 0,
  
  -- Errores
  last_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para queries rápidas
CREATE INDEX IF NOT EXISTS idx_import_runs_source_id ON import_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_import_runs_status ON import_runs(status);
CREATE INDEX IF NOT EXISTS idx_import_runs_started_at ON import_runs(started_at DESC);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_import_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_import_runs_updated_at
  BEFORE UPDATE ON import_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_import_runs_updated_at();

-- Tabla opcional para trazabilidad detallada por chunk
CREATE TABLE IF NOT EXISTS import_run_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  
  chunk_index INTEGER NOT NULL,
  offset_start INTEGER NOT NULL,
  offset_end INTEGER NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'done', 'failed')),
  
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  
  error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(run_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_import_run_chunks_run_id ON import_run_chunks(run_id);

COMMENT ON TABLE import_runs IS 'Ejecuciones de importación PRO: resumibles, cancelables, sin re-descargar CSV';
COMMENT ON COLUMN import_runs.storage_path IS 'Ruta del CSV en Supabase Storage (imports bucket)';
COMMENT ON COLUMN import_runs.heartbeat_at IS 'Última actividad del run (para detectar timeouts)';
