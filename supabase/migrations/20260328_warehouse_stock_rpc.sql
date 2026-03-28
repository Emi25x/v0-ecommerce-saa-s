-- RPC function for warehouse stock queries.
-- Uses proper SQL with index support instead of PostgREST JSONB filters
-- which generate unoptimizable queries on large tables.

CREATE OR REPLACE FUNCTION get_warehouse_stock(
  p_source_keys TEXT[],
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  ean TEXT,
  sku TEXT,
  title TEXT,
  stock INT,
  cost_price NUMERIC,
  stock_by_source JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Count total matching products
  IF p_search IS NOT NULL AND p_search != '' THEN
    SELECT COUNT(*) INTO v_total
    FROM products p
    WHERE p.stock > 0
      AND EXISTS (
        SELECT 1 FROM unnest(p_source_keys) AS sk
        WHERE (p.stock_by_source->>sk) IS NOT NULL
      )
      AND (
        p.title ILIKE '%' || p_search || '%'
        OR p.sku ILIKE '%' || p_search || '%'
        OR p.ean ILIKE '%' || p_search || '%'
      );
  ELSE
    SELECT COUNT(*) INTO v_total
    FROM products p
    WHERE p.stock > 0
      AND EXISTS (
        SELECT 1 FROM unnest(p_source_keys) AS sk
        WHERE (p.stock_by_source->>sk) IS NOT NULL
      );
  END IF;

  -- Return paginated results with total_count in every row
  IF p_search IS NOT NULL AND p_search != '' THEN
    RETURN QUERY
    SELECT
      p.id, p.ean, p.sku, p.title, p.stock,
      p.cost_price, p.stock_by_source,
      v_total AS total_count
    FROM products p
    WHERE p.stock > 0
      AND EXISTS (
        SELECT 1 FROM unnest(p_source_keys) AS sk
        WHERE (p.stock_by_source->>sk) IS NOT NULL
      )
      AND (
        p.title ILIKE '%' || p_search || '%'
        OR p.sku ILIKE '%' || p_search || '%'
        OR p.ean ILIKE '%' || p_search || '%'
      )
    ORDER BY p.stock DESC, p.id ASC
    LIMIT p_limit OFFSET p_offset;
  ELSE
    RETURN QUERY
    SELECT
      p.id, p.ean, p.sku, p.title, p.stock,
      p.cost_price, p.stock_by_source,
      v_total AS total_count
    FROM products p
    WHERE p.stock > 0
      AND EXISTS (
        SELECT 1 FROM unnest(p_source_keys) AS sk
        WHERE (p.stock_by_source->>sk) IS NOT NULL
      )
    ORDER BY p.stock DESC, p.id ASC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

-- Optimized index for this query pattern
CREATE INDEX IF NOT EXISTS idx_products_stock_sbs_not_null
  ON products (stock DESC, id ASC)
  WHERE stock > 0 AND stock_by_source IS NOT NULL;
