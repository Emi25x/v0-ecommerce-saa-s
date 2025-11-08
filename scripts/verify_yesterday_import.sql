-- Verificar la importación exitosa de ayer (25/10/2025)
SELECT 
  ih.id,
  ih.started_at,
  ih.completed_at,
  ih.status,
  ih.products_imported,
  ih.products_updated,
  ih.products_failed,
  is2.name as source_name,
  is2.feed_type
FROM import_history ih
JOIN import_sources is2 ON ih.source_id = is2.id
WHERE DATE(ih.started_at) = '2025-10-25'
ORDER BY ih.started_at DESC;

-- Verificar los productos importados de Arnoia
SELECT 
  COUNT(*) as total_products,
  COUNT(DISTINCT sku) as unique_skus,
  MIN(created_at) as first_import,
  MAX(updated_at) as last_update
FROM products
WHERE 'Arnoia Act' = ANY(source) OR 'Arnoia' = ANY(source);

-- Ver algunos productos de ejemplo
SELECT 
  sku,
  title,
  price,
  stock,
  source,
  custom_fields,
  updated_at
FROM products
WHERE 'Arnoia Act' = ANY(source) OR 'Arnoia' = ANY(source)
ORDER BY updated_at DESC
LIMIT 10;
