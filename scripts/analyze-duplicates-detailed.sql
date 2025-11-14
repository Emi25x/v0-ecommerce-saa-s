-- SCRIPT 1: ANÁLISIS COMPLETO DE DUPLICADOS
-- Ejecutar este script PRIMERO en el SQL Editor de Supabase para ver qué hay

-- 1. Estadísticas generales
SELECT 
  COUNT(*) as total_productos,
  COUNT(DISTINCT UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', '')))) as skus_unicos,
  COUNT(*) - COUNT(DISTINCT UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', '')))) as total_duplicados
FROM products
WHERE sku IS NOT NULL AND sku != '';

-- 2. Ver los 50 SKUs con más duplicados
SELECT 
  UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', ''))) as sku_normalizado,
  COUNT(*) as cantidad_total,
  COUNT(*) - 1 as duplicados_a_eliminar,
  MIN(created_at) as primer_producto_fecha,
  MAX(created_at) as ultimo_producto_fecha,
  STRING_AGG(DISTINCT title, ' | ') as titulos
FROM products
WHERE sku IS NOT NULL AND sku != ''
GROUP BY UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', '')))
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 50;
