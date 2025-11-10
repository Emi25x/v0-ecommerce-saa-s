-- Limpiar importaciones atascadas (en estado "in_progress")
-- Este script actualiza las importaciones que quedaron en curso
-- y las marca como "cancelled" para que puedas iniciar nuevas importaciones

UPDATE import_history
SET 
  status = 'cancelled',
  completed_at = NOW(),
  updated_at = NOW()
WHERE status = 'in_progress'
AND created_at < NOW() - INTERVAL '1 hour';

-- Muestra las importaciones actualizadas
SELECT 
  id,
  source_id,
  status,
  products_imported,
  products_updated,
  started_at,
  completed_at
FROM import_history
WHERE status = 'cancelled'
ORDER BY started_at DESC
LIMIT 5;
