-- 1) Crear función para claim atómico de items (evita duplicados y race conditions)
CREATE OR REPLACE FUNCTION claim_import_items(p_job_id uuid, p_limit int)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  ml_item_id text,
  status text,
  attempts int,
  last_error text,
  created_at timestamptz,
  processed_at timestamptz
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
    ORDER BY ml_import_queue.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED  -- Clave: otros workers no tocan estos rows
  )
  RETURNING 
    ml_import_queue.id,
    ml_import_queue.job_id,
    ml_import_queue.ml_item_id,
    ml_import_queue.status,
    ml_import_queue.attempts,
    ml_import_queue.last_error,
    ml_import_queue.created_at,
    ml_import_queue.processed_at;
END;
$$ LANGUAGE plpgsql;

-- 2) Índices críticos para performance

-- Para buscar productos por SKU/EAN rápidamente (217k productos)
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean);

-- Para queries de ml_import_queue (job_id + status)
CREATE INDEX IF NOT EXISTS idx_ml_import_queue_job_status 
  ON ml_import_queue(job_id, status);

-- Para evitar duplicados y búsquedas rápidas en ml_publications
CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_publications_item_id 
  ON ml_publications(ml_item_id);

-- Para el health check (filtros de competencia/elegibilidad)
CREATE INDEX IF NOT EXISTS idx_ml_publications_competing 
  ON ml_publications(account_id, is_competing) 
  WHERE is_competing = true;

CREATE INDEX IF NOT EXISTS idx_ml_publications_eligible 
  ON ml_publications(account_id, catalog_listing_eligible) 
  WHERE catalog_listing_eligible = true;

-- Para queries de jobs activos
CREATE INDEX IF NOT EXISTS idx_ml_import_jobs_status 
  ON ml_import_jobs(account_id, status);

COMMENT ON FUNCTION claim_import_items IS 'Reclama items pendientes atómicamente usando FOR UPDATE SKIP LOCKED para evitar race conditions entre múltiples workers';
