-- Encuentra TODOS los SKUs duplicados en la base de datos
-- Este script se ejecuta directamente en PostgreSQL y es instantáneo

SELECT 
  LOWER(TRIM(sku)) as normalized_sku,
  COUNT(*) as total_products,
  COUNT(*) - 1 as duplicates_count,
  ARRAY_AGG(id ORDER BY created_at ASC) as product_ids,
  ARRAY_AGG(created_at ORDER BY created_at ASC) as created_dates
FROM products
WHERE sku IS NOT NULL AND sku != ''
GROUP BY LOWER(TRIM(sku))
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;
