-- =============================================
-- FUNCIÓN SQL PRODUCTION-SAFE: claim_import_items
-- =============================================
-- Cambios críticos aplicados:
-- 1. COALESCE(attempts, 0) + 1 para manejar NULL
-- 2. (next_retry_at IS NULL OR next_retry_at <= NOW()) para aceptar NULL
-- 3. Recupera items "stuck" en processing > 15 minutos
-- 4. Agrega claimed_at para tracking
-- 5. Mantiene atomicidad con FOR UPDATE SKIP LOCKED
-- =============================================

-- Paso 1: Agregar columna claimed_at si no existe
ALTER TABLE ml_import_queue 
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE;

-- Paso 2: Crear índice para items stuck
CREATE INDEX IF NOT EXISTS idx_ml_import_queue_stuck 
  ON ml_import_queue(job_id, status, claimed_at)
  WHERE status = 'processing';

-- Paso 3: DROP y recrear función mejorada
DROP FUNCTION IF EXISTS claim_import_items(uuid, integer);

CREATE FUNCTION claim_import_items(p_job_id uuid, p_limit int)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  ml_item_id text,
  status text,
  attempts int,
  last_error text,
  created_at timestamptz,
  processed_at timestamptz,
  next_retry_at timestamptz,
  claimed_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  UPDATE ml_import_queue
  SET 
    status = 'processing',
    attempts = COALESCE(ml_import_queue.attempts, 0) + 1,
    claimed_at = NOW()
  WHERE ml_import_queue.id IN (
    SELECT ml_import_queue.id
    FROM ml_import_queue
    WHERE ml_import_queue.job_id = p_job_id
      AND (
        -- Items pendientes listos para procesar
        (ml_import_queue.status = 'pending' 
         AND (ml_import_queue.next_retry_at IS NULL OR ml_import_queue.next_retry_at <= NOW()))
        OR
        -- Items "stuck" en processing por más de 15 minutos (recovery)
        (ml_import_queue.status = 'processing'
         AND ml_import_queue.claimed_at < NOW() - INTERVAL '15 minutes')
      )
    ORDER BY 
      -- Prioridad: pending primero, luego stuck
      CASE WHEN ml_import_queue.status = 'pending' THEN 0 ELSE 1 END,
      ml_import_queue.next_retry_at ASC NULLS FIRST,
      ml_import_queue.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    ml_import_queue.id,
    ml_import_queue.job_id,
    ml_import_queue.ml_item_id,
    ml_import_queue.status,
    ml_import_queue.attempts,
    ml_import_queue.last_error,
    ml_import_queue.created_at,
    ml_import_queue.processed_at,
    ml_import_queue.next_retry_at,
    ml_import_queue.claimed_at;
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON FUNCTION claim_import_items IS 'Reclama items atómicamente con FOR UPDATE SKIP LOCKED. Recupera items stuck en processing > 15 min.';
COMMENT ON COLUMN ml_import_queue.claimed_at IS 'Timestamp del último claim. Permite detectar workers muertos y recuperar items stuck.';
COMMENT ON COLUMN ml_import_queue.next_retry_at IS 'Backoff exponencial. NULL = procesar inmediatamente. <= NOW() = listo para reintentar.';
