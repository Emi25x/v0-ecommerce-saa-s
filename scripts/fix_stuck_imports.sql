-- Actualiza todas las importaciones atascadas en estado "in_progress" a "cancelled"
UPDATE import_history 
SET 
  status = 'cancelled',
  completed_at = NOW(),
  error_message = 'Importación cancelada manualmente por estar atascada'
WHERE status = 'in_progress' 
  AND started_at < NOW() - INTERVAL '1 hour';

-- Muestra las importaciones que se actualizaron
SELECT 
  id,
  source_id,
  started_at,
  status,
  products_imported,
  products_updated
FROM import_history 
WHERE status = 'cancelled' 
  AND completed_at > NOW() - INTERVAL '1 minute'
ORDER BY completed_at DESC;
