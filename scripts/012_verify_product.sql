-- Verificar si el producto con SKU 9788466739894 existe en la base de datos
SELECT 
  id,
  sku,
  title,
  price,
  stock,
  source,
  internal_code,
  created_at,
  updated_at
FROM products
WHERE sku = '9788466739894';

-- Contar total de productos en la base de datos
SELECT COUNT(*) as total_products FROM products;

-- Ver los últimos 10 productos insertados
SELECT 
  id,
  sku,
  title,
  source,
  created_at
FROM products
ORDER BY created_at DESC
LIMIT 10;

-- Ver productos con source que contenga 'Arnoia' (como texto, no como ID)
SELECT 
  id,
  sku,
  title,
  source,
  created_at
FROM products
WHERE source::text LIKE '%Arnoia%'
LIMIT 10;
