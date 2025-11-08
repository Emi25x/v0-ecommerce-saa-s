-- Buscar TODAS las importaciones exitosas de Arnoia
SELECT 
  ih.id,
  ih.started_at,
  ih.completed_at,
  ih.status,
  ih.products_imported,
  ih.products_updated,
  ih.products_failed,
  ih.error_message,
  ims.name,
  ims.feed_type
FROM import_history ih
JOIN import_sources ims ON ih.source_id = ims.id
WHERE ims.name LIKE '%Arnoia%'
  AND ih.status = 'completed'
  AND (ih.products_imported > 0 OR ih.products_updated > 0)
ORDER BY ih.started_at DESC
LIMIT 10;
