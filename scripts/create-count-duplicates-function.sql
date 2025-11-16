-- Función SQL para contar duplicados sin traer datos al cliente
-- Ejecuta en el SQL Editor de Supabase para análisis instantáneo

CREATE OR REPLACE FUNCTION count_duplicate_skus_v2()
RETURNS TABLE (
  total_products BIGINT,
  duplicate_skus BIGINT,
  duplicate_products BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH normalized_skus AS (
    SELECT 
      id,
      UPPER(TRIM(REGEXP_REPLACE(sku::text, '[\s-]', '', 'g'))) as normalized_sku,
      created_at
    FROM products
    WHERE sku IS NOT NULL AND sku != ''
  ),
  sku_counts AS (
    SELECT 
      normalized_sku,
      COUNT(*) as count
    FROM normalized_skus
    GROUP BY normalized_sku
  ),
  duplicate_counts AS (
    SELECT 
      COUNT(*) as duplicate_sku_count,
      SUM(count - 1) as duplicate_product_count
    FROM sku_counts
    WHERE count > 1
  )
  SELECT 
    (SELECT COUNT(*) FROM products WHERE sku IS NOT NULL AND sku != '')::BIGINT as total_products,
    COALESCE((SELECT duplicate_sku_count FROM duplicate_counts), 0)::BIGINT as duplicate_skus,
    COALESCE((SELECT duplicate_product_count FROM duplicate_counts), 0)::BIGINT as duplicate_products;
END;
$$ LANGUAGE plpgsql;
