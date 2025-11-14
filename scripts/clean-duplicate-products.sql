-- SCRIPT 2: LIMPIEZA DE DUPLICADOS
-- ADVERTENCIA: Este script ELIMINARÁ productos duplicados permanentemente
-- Mantiene el producto MÁS ANTIGUO (created_at más temprano) de cada SKU

-- PASO 1: Primero ejecuta esta consulta para ver cuántos productos se van a eliminar
SELECT COUNT(*) as productos_a_eliminar
FROM (
  SELECT 
    id,
    UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', ''))) as normalized_sku,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', ''))) 
      ORDER BY created_at ASC
    ) as row_num
  FROM products
  WHERE sku IS NOT NULL AND sku != ''
) ranked
WHERE row_num > 1;

-- PASO 2: Descomentar y ejecutar estas líneas para ELIMINAR los duplicados
-- IMPORTANTE: Esta acción NO SE PUEDE DESHACER

/*
DELETE FROM products
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', ''))) as normalized_sku,
      ROW_NUMBER() OVER (
        PARTITION BY UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', ''))) 
        ORDER BY created_at ASC
      ) as row_num
    FROM products
    WHERE sku IS NOT NULL AND sku != ''
  ) ranked
  WHERE row_num > 1
);
*/

-- PASO 3: Después de ejecutar la limpieza, verifica el resultado
/*
SELECT 
  COUNT(*) as total_productos_restantes,
  COUNT(DISTINCT UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', '')))) as skus_unicos,
  COUNT(*) - COUNT(DISTINCT UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', '')))) as duplicados_restantes
FROM products
WHERE sku IS NOT NULL AND sku != '';
*/
