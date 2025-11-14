-- Función SQL para detectar duplicados de forma ultra rápida
-- PostgreSQL ejecuta esto en el servidor en ~1-2 segundos

CREATE OR REPLACE FUNCTION count_duplicate_skus()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  WITH normalized_skus AS (
    SELECT 
      id,
      sku,
      title,
      source,
      UPPER(TRIM(REGEXP_REPLACE(sku, '[\s\-]', '', 'g'))) as normalized_sku
    FROM products
    WHERE sku IS NOT NULL AND sku != ''
  ),
  sku_counts AS (
    SELECT 
      normalized_sku,
      COUNT(*) as count
    FROM normalized_skus
    GROUP BY normalized_sku
    HAVING COUNT(*) > 1
  ),
  source_counts AS (
    SELECT 
      COALESCE(s.name, 'Sin fuente') as source_name,
      COUNT(*) as product_count
    FROM products p
    LEFT JOIN import_sources s ON s.id = ANY(
      CASE 
        WHEN p.source IS NOT NULL THEN p.source
        ELSE ARRAY[]::uuid[]
      END
    )
    GROUP BY s.name
  ),
  corrupted_titles AS (
    SELECT sku, COALESCE(title, 'Sin título') as title
    FROM products
    WHERE title IS NULL OR title = '' OR title ~ '^\d+\.?\d*$'
    LIMIT 50
  )
  SELECT json_build_object(
    'totalProducts', (SELECT COUNT(*) FROM products),
    'duplicateSKUs', (SELECT COUNT(*) FROM sku_counts),
    'totalDuplicates', (SELECT COALESCE(SUM(count - 1), 0) FROM sku_counts),
    'productsBySource', (SELECT json_agg(json_build_object('source', source_name, 'count', product_count)) FROM source_counts),
    'corruptedTitles', (SELECT json_agg(json_build_object('sku', sku, 'title', title)) FROM corrupted_titles)
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
