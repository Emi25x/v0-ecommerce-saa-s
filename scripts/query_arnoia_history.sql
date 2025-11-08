-- Buscar solo "Arnoia" en lugar de "Arnoia Act"
-- Consultar el historial de importaciones exitosas de Arnoia
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
  ims.feed_type,
  ims.url_template,
  ims.column_mapping,
  ims.auth_type
FROM import_history ih
JOIN import_sources ims ON ih.source_id = ims.id
WHERE ims.name = 'Arnoia'
  AND ih.started_at >= '2025-10-18 00:00:00'
  AND ih.started_at < '2025-10-19 00:00:00'
  AND ih.status = 'completed'
  AND (ih.products_imported > 0 OR ih.products_updated > 0)
ORDER BY ih.started_at DESC
LIMIT 5;

-- También consultar la configuración actual de la fuente
SELECT 
  id,
  name,
  feed_type,
  url_template,
  column_mapping,
  auth_type,
  created_at,
  updated_at
FROM import_sources
WHERE name = 'Arnoia';
