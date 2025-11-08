-- Consultar importaciones exitosas del 18 de octubre de 2025
SELECT 
  ih.id,
  ih.source_id,
  is_table.name as source_name,
  ih.status,
  ih.products_imported,
  ih.products_updated,
  ih.products_failed,
  ih.started_at,
  ih.completed_at,
  ih.error_message,
  EXTRACT(EPOCH FROM (ih.completed_at - ih.started_at)) as duration_seconds
FROM import_history ih
JOIN import_sources is_table ON ih.source_id = is_table.id
WHERE 
  ih.started_at >= '2025-10-18 00:00:00'
  AND ih.started_at < '2025-10-19 00:00:00'
  AND (ih.products_imported > 0 OR ih.products_updated > 0)
ORDER BY ih.started_at DESC;
