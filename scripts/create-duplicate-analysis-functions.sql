-- Función para analizar SKUs duplicados (versión optimizada)
CREATE OR REPLACE FUNCTION analyze_duplicate_skus()
RETURNS TABLE (
  total_products BIGINT,
  unique_skus BIGINT,
  duplicate_skus_count BIGINT,
  total_duplicate_products BIGINT
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH sku_counts AS (
    SELECT 
      UPPER(TRIM(sku)) as normalized_sku,
      COUNT(*) as product_count
    FROM products
    WHERE sku IS NOT NULL AND sku != ''
    GROUP BY UPPER(TRIM(sku))
  ),
  duplicates AS (
    SELECT 
      normalized_sku,
      product_count,
      product_count - 1 as duplicate_count
    FROM sku_counts
    WHERE product_count > 1
  )
  SELECT 
    (SELECT COUNT(*) FROM products)::BIGINT as total_products,
    (SELECT COUNT(*) FROM sku_counts)::BIGINT as unique_skus,
    (SELECT COUNT(*) FROM duplicates)::BIGINT as duplicate_skus_count,
    (SELECT COALESCE(SUM(duplicate_count), 0) FROM duplicates)::BIGINT as total_duplicate_products;
END;
$$;

-- Función alternativa para contar duplicados
CREATE OR REPLACE FUNCTION get_duplicate_skus_count()
RETURNS TABLE (duplicate_count BIGINT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(*)::BIGINT
  FROM (
    SELECT UPPER(TRIM(sku)) as normalized_sku
    FROM products
    WHERE sku IS NOT NULL AND sku != ''
    GROUP BY UPPER(TRIM(sku))
    HAVING COUNT(*) > 1
  ) duplicates;
END;
$$;

-- Otorgar permisos
GRANT EXECUTE ON FUNCTION analyze_duplicate_skus() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_duplicate_skus_count() TO authenticated, anon, service_role;
