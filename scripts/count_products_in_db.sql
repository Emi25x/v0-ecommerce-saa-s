-- Contar productos totales en la base de datos
SELECT COUNT(*) as total_products FROM products;

-- Contar productos por fuente
SELECT 
  UNNEST(source) as source_name,
  COUNT(*) as product_count
FROM products
GROUP BY source_name
ORDER BY product_count DESC;

-- Ver algunos SKUs de ejemplo
SELECT sku, title, stock, price, source
FROM products
LIMIT 20;
