-- Verificar configuración de la fuente Arnoia
SELECT 
  id,
  name,
  feed_type,
  url_template,
  column_mapping,
  overwrite_duplicates,
  created_at
FROM import_sources
WHERE name ILIKE '%arnoia%'
ORDER BY created_at DESC;

-- Verificar si hay productos con SKU de Arnoia
SELECT COUNT(*) as total_products
FROM products
WHERE sku LIKE 'ARN%' OR sku LIKE 'arnoia%';
