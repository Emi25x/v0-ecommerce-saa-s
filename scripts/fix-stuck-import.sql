-- Fix stuck import: marca los 15 items pendientes como procesados
-- para que el job pueda avanzar a indexing y continuar con los siguientes items

UPDATE ml_import_queue
SET processed_at = NOW()
WHERE job_id = '7ebc6f7f-be2c-45de-870e-5f84f00d113e'
  AND processed_at IS NULL;

-- Verificar estado actualizado
SELECT 
  status,
  current_offset,
  (SELECT COUNT(*) FROM ml_import_queue WHERE job_id = ml_import_jobs.id) as total_queued,
  (SELECT COUNT(*) FROM ml_import_queue WHERE job_id = ml_import_jobs.id AND processed_at IS NOT NULL) as processed,
  (SELECT COUNT(*) FROM ml_import_queue WHERE job_id = ml_import_jobs.id AND processed_at IS NULL) as pending
FROM ml_import_jobs
WHERE id = '7ebc6f7f-be2c-45de-870e-5f84f00d113e';
