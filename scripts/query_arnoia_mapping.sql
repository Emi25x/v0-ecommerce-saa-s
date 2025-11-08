-- Consultar la configuración completa de la fuente Arnoia
SELECT 
  id,
  name,
  feed_type,
  url_template,
  column_mapping,
  is_active,
  last_import_at
FROM import_sources
WHERE name ILIKE '%arnoia%'
ORDER BY created_at DESC;
