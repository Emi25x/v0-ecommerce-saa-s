-- Extender ml_matcher_progress para incluir todas las métricas necesarias
-- Siguiendo instrucciones del usuario: simplificar en UNA tabla con progreso + métricas

-- 1) Agregar columnas de estado y timing
ALTER TABLE ml_matcher_progress
ADD COLUMN IF NOT EXISTS status text DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- 2) Agregar contadores detallados
ALTER TABLE ml_matcher_progress
ADD COLUMN IF NOT EXISTS scanned_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS candidate_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS matched_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS ambiguous_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS not_found_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS invalid_identifier_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_count integer DEFAULT 0;

-- 3) Agregar tracking de errores
ALTER TABLE ml_matcher_progress
ADD COLUMN IF NOT EXISTS last_error text;

-- 4) Crear índice para queries por estado
CREATE INDEX IF NOT EXISTS idx_ml_matcher_progress_status 
ON ml_matcher_progress(account_id, status);

-- Comentarios
COMMENT ON COLUMN ml_matcher_progress.status IS 'Estado: idle, running, completed, failed';
COMMENT ON COLUMN ml_matcher_progress.started_at IS 'Timestamp de inicio de la última corrida';
COMMENT ON COLUMN ml_matcher_progress.finished_at IS 'Timestamp de finalización de la última corrida';
COMMENT ON COLUMN ml_matcher_progress.scanned_count IS 'Total de publicaciones escaneadas en la corrida actual';
COMMENT ON COLUMN ml_matcher_progress.candidate_count IS 'Publicaciones con identificadores válidos (SKU/ISBN/EAN)';
COMMENT ON COLUMN ml_matcher_progress.matched_count IS 'Publicaciones vinculadas exitosamente';
COMMENT ON COLUMN ml_matcher_progress.ambiguous_count IS 'Publicaciones con múltiples matches (ambiguas)';
COMMENT ON COLUMN ml_matcher_progress.not_found_count IS 'Identificadores sin match en catálogo';
COMMENT ON COLUMN ml_matcher_progress.invalid_identifier_count IS 'Identificadores inválidos o malformados';
COMMENT ON COLUMN ml_matcher_progress.error_count IS 'Errores durante procesamiento';
COMMENT ON COLUMN ml_matcher_progress.last_error IS 'Último mensaje de error (si status = failed)';
