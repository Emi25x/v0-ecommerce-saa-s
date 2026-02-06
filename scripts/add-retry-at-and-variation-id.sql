-- 1) Agregar next_retry_at para backoff exponencial serverless-safe
ALTER TABLE ml_import_queue 
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2) Agregar variation_id a ml_publications para tracking correcto
ALTER TABLE ml_publications 
  ADD COLUMN IF NOT EXISTS variation_id BIGINT;

-- 3) Crear índice para el claim con next_retry_at
CREATE INDEX IF NOT EXISTS idx_ml_import_queue_retry 
  ON ml_import_queue(job_id, status, next_retry_at)
  WHERE status = 'pending';

-- 4) Actualizar la función claim para respetar next_retry_at
CREATE OR REPLACE FUNCTION claim_import_items(p_job_id uuid, p_limit int)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  ml_item_id text,
  status text,
  attempts int,
  last_error text,
  created_at timestamptz,
  processed_at timestamptz,
  next_retry_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  UPDATE ml_import_queue
  SET 
    status = 'processing',
    attempts = attempts + 1
  WHERE ml_import_queue.id IN (
    SELECT ml_import_queue.id
    FROM ml_import_queue
    WHERE ml_import_queue.job_id = p_job_id
      AND ml_import_queue.status = 'pending'
      AND ml_import_queue.next_retry_at <= NOW() -- Solo items listos para reintentar
    ORDER BY ml_import_queue.next_retry_at ASC, ml_import_queue.created_at ASC
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
    ml_import_queue.next_retry_at;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN ml_import_queue.next_retry_at IS 'Timestamp para backoff exponencial. El claim solo toma items donde next_retry_at <= NOW()';
COMMENT ON COLUMN ml_publications.variation_id IS 'ID de la variación de ML cuando el match fue por variation SKU/GTIN';
