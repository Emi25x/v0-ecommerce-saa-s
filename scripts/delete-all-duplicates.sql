-- ELIMINA todos los duplicados manteniendo el producto más antiguo de cada SKU
-- CUIDADO: Esta operación NO se puede revertir

WITH duplicates AS (
  SELECT 
    id,
    LOWER(TRIM(sku)) as normalized_sku,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(sku)) 
      ORDER BY created_at ASC
    ) as row_num
  FROM products
  WHERE sku IS NOT NULL AND sku != ''
)
DELETE FROM products
WHERE id IN (
  SELECT id 
  FROM duplicates 
  WHERE row_num > 1
)
RETURNING id, sku;
