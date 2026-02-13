-- Alinear ml_matcher_progress con ml_import_progress para consistencia
-- Siguiendo el mismo patrón que usa el importador

-- 1) Eliminar columnas viejas que no se usan o están mal nombradas
ALTER TABLE ml_matcher_progress
DROP COLUMN IF EXISTS scanned_count,
DROP COLUMN IF EXISTS candidate_count,
DROP COLUMN IF EXISTS total_matched,
DROP COLUMN IF EXISTS total_unmatched;

-- 2) Agregar columnas alineadas con import (total_target + processed_count)
ALTER TABLE ml_matcher_progress
ADD COLUMN IF NOT EXISTS total_target integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS processed_count integer DEFAULT 0;

-- 3) Asegurar que existan todos los contadores necesarios
ALTER TABLE ml_matcher_progress
ADD COLUMN IF NOT EXISTS matched_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS ambiguous_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS not_found_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS invalid_identifier_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_count integer DEFAULT 0;

-- 4) Agregar columnas de control igual que import
ALTER TABLE ml_matcher_progress
ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
ADD COLUMN IF NOT EXISTS cursor jsonb DEFAULT '{}'::jsonb;

-- 5) Agregar last_run_id para identificar corridas (opcional pero útil)
ALTER TABLE ml_matcher_progress
ADD COLUMN IF NOT EXISTS last_run_id uuid;

-- 6) Actualizar constraint de status si no existe
DO $$ 
BEGIN
  ALTER TABLE ml_matcher_progress
  DROP CONSTRAINT IF EXISTS ml_matcher_progress_status_check;
  
  ALTER TABLE ml_matcher_progress
  ADD CONSTRAINT ml_matcher_progress_status_check 
  CHECK (status IN ('idle', 'running', 'completed', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 7) Crear índices optimizados
CREATE INDEX IF NOT EXISTS idx_ml_matcher_progress_account_status 
ON ml_matcher_progress(account_id, status);

CREATE INDEX IF NOT EXISTS idx_ml_matcher_progress_heartbeat 
ON ml_matcher_progress(last_heartbeat_at) WHERE status = 'running';

-- Comentarios actualizados
COMMENT ON TABLE ml_matcher_progress IS 'Tracking de matching incremental por cuenta ML (alineado con ml_import_progress)';
COMMENT ON COLUMN ml_matcher_progress.total_target IS 'Total de publicaciones elegibles para matching en esta corrida (denominador fijo)';
COMMENT ON COLUMN ml_matcher_progress.processed_count IS 'Publicaciones procesadas en la corrida actual (numerador)';
COMMENT ON COLUMN ml_matcher_progress.matched_count IS 'Publicaciones vinculadas exitosamente (product_id asignado)';
COMMENT ON COLUMN ml_matcher_progress.ambiguous_count IS 'Múltiples matches encontrados (ambiguo)';
COMMENT ON COLUMN ml_matcher_progress.not_found_count IS 'Sin match en catálogo';
COMMENT ON COLUMN ml_matcher_progress.invalid_identifier_count IS 'Sin identificadores válidos';
COMMENT ON COLUMN ml_matcher_progress.error_count IS 'Errores durante procesamiento';
COMMENT ON COLUMN ml_matcher_progress.last_heartbeat_at IS 'Último heartbeat para detectar procesos colgados';
COMMENT ON COLUMN ml_matcher_progress.cursor IS 'Cursor para reanudar (ej: {"last_publication_id": "uuid"})';
COMMENT ON COLUMN ml_matcher_progress.last_run_id IS 'UUID de la última corrida (opcional, para auditoría)';
