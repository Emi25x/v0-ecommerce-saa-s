-- Consultar la configuración completa de la fuente "Arnoia"
SELECT 
  id,
  name,
  feed_type,
  url_template,
  auth_type,
  column_mapping,
  is_active,
  last_import_at,
  created_at
FROM import_sources
WHERE name = 'Arnoia'
LIMIT 1;
