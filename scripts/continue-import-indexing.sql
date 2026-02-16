-- Cambiar job de processing a indexing para continuar importando items
-- El job tiene 100/100 items procesados, necesita volver a indexing para procesar los siguientes 200

UPDATE ml_import_jobs
SET 
  status = 'indexing',
  updated_at = NOW()
WHERE id = '7ebc6f7f-be2c-45de-870e-5f84f00d113e'
  AND status = 'processing';

-- Verificar el cambio
SELECT 
  id, 
  status, 
  current_offset, 
  total_items,
  (SELECT COUNT(*) FROM ml_import_queue WHERE job_id = ml_import_jobs.id) as total_queued,
  (SELECT COUNT(*) FROM ml_import_queue WHERE job_id = ml_import_jobs.id AND processed_at IS NOT NULL) as processed_count
FROM ml_import_jobs
WHERE id = '7ebc6f7f-be2c-45de-870e-5f84f00d113e';
