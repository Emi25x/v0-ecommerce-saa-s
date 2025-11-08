-- Consultar la configuración de la fuente "Arnoia Act"
SELECT 
  id,
  name,
  url_template,
  column_mapping,
  is_active,
  last_import_at
FROM import_sources
WHERE name ILIKE '%arnoia%act%'
ORDER BY created_at DESC;
