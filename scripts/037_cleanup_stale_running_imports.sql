-- Limpiar imports con status "running" que llevan más de 2 horas colgados
-- Estos son imports que fallaron sin actualizar su status correctamente

UPDATE import_history
SET 
  status = 'failed',
  completed_at = NOW(),
  error_message = 'Import timed out - marked as failed by cleanup script'
WHERE 
  status = 'running'
  AND started_at < NOW() - INTERVAL '2 hours';

-- Verificar cuántos se actualizaron
SELECT 
  COUNT(*) as cleaned_imports,
  string_agg(DISTINCT source_id::text, ', ') as affected_sources
FROM import_history
WHERE 
  status = 'failed'
  AND error_message = 'Import timed out - marked as failed by cleanup script';
