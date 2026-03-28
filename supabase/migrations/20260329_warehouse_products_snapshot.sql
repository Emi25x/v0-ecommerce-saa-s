-- ============================================================================
-- WAREHOUSE PRODUCTS SNAPSHOT
--
-- Pre-computed table for fast warehouse stock queries.
-- Eliminates JSONB filtering at query time on 220K+ products.
-- Refreshed after each stock import via refresh_warehouse_products().
-- ============================================================================

-- 1. Snapshot table
CREATE TABLE IF NOT EXISTS warehouse_products (
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ean TEXT,
  sku TEXT,
  title TEXT,
  warehouse_stock INTEGER NOT NULL DEFAULT 0,
  cost_price NUMERIC,
  source_detail JSONB,        -- {"libral_argentina": 5, "arnoia": 10}
  has_ml BOOLEAN NOT NULL DEFAULT FALSE,
  ml_count INTEGER NOT NULL DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wp_warehouse_stock
  ON warehouse_products (warehouse_id, warehouse_stock DESC, product_id ASC)
  WHERE warehouse_stock > 0;

CREATE INDEX IF NOT EXISTS idx_wp_warehouse_ean
  ON warehouse_products (warehouse_id, ean);

CREATE INDEX IF NOT EXISTS idx_wp_warehouse_search
  ON warehouse_products USING gin (title gin_trgm_ops);

-- 2. Summary table (one row per warehouse, for instant stats)
CREATE TABLE IF NOT EXISTS warehouse_stock_summary (
  warehouse_id UUID PRIMARY KEY REFERENCES warehouses(id) ON DELETE CASCADE,
  total_skus INTEGER NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 0,
  published_ml INTEGER NOT NULL DEFAULT 0,
  unpublished_ml INTEGER NOT NULL DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Refresh function
CREATE OR REPLACE FUNCTION refresh_warehouse_products(p_warehouse_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_wh RECORD;
  v_source_keys TEXT[];
  v_refreshed INT := 0;
  v_results JSONB := '[]'::JSONB;
BEGIN
  -- Loop over target warehouses (one or all)
  FOR v_wh IN
    SELECT w.id AS warehouse_id
    FROM warehouses w
    WHERE p_warehouse_id IS NULL OR w.id = p_warehouse_id
  LOOP
    -- Get source_keys for this warehouse
    SELECT array_agg(COALESCE(source_key, lower(replace(name, ' ', '_'))))
    INTO v_source_keys
    FROM import_sources
    WHERE warehouse_id = v_wh.warehouse_id
      AND COALESCE(source_key, '') != '';

    -- Skip if no sources linked
    IF v_source_keys IS NULL OR array_length(v_source_keys, 1) IS NULL THEN
      DELETE FROM warehouse_products WHERE warehouse_id = v_wh.warehouse_id;
      DELETE FROM warehouse_stock_summary WHERE warehouse_id = v_wh.warehouse_id;
      CONTINUE;
    END IF;

    -- Delete old snapshot for this warehouse
    DELETE FROM warehouse_products WHERE warehouse_id = v_wh.warehouse_id;

    -- Insert fresh snapshot
    INSERT INTO warehouse_products (
      warehouse_id, product_id, ean, sku, title,
      warehouse_stock, cost_price, source_detail,
      has_ml, ml_count, refreshed_at
    )
    SELECT
      v_wh.warehouse_id,
      p.id,
      p.ean,
      p.sku,
      p.title,
      -- Sum stock from warehouse's source keys only
      COALESCE((
        SELECT SUM((p.stock_by_source->>sk)::int)
        FROM unnest(v_source_keys) AS sk
        WHERE (p.stock_by_source->>sk) IS NOT NULL
      ), 0) AS warehouse_stock,
      p.cost_price,
      -- Extract only relevant source keys
      (
        SELECT jsonb_object_agg(sk, (p.stock_by_source->>sk)::int)
        FROM unnest(v_source_keys) AS sk
        WHERE (p.stock_by_source->>sk) IS NOT NULL
      ) AS source_detail,
      -- ML publications
      EXISTS (
        SELECT 1 FROM ml_publications mp WHERE mp.product_id = p.id
      ) AS has_ml,
      (
        SELECT COUNT(*)::int FROM ml_publications mp WHERE mp.product_id = p.id
      ) AS ml_count,
      NOW()
    FROM products p
    WHERE p.stock > 0
      AND EXISTS (
        SELECT 1 FROM unnest(v_source_keys) AS sk
        WHERE (p.stock_by_source->>sk) IS NOT NULL
          AND (p.stock_by_source->>sk)::int > 0
      );

    -- Update summary
    INSERT INTO warehouse_stock_summary (
      warehouse_id, total_skus, total_units, published_ml, unpublished_ml, refreshed_at
    )
    SELECT
      v_wh.warehouse_id,
      COUNT(*),
      COALESCE(SUM(warehouse_stock), 0),
      COUNT(*) FILTER (WHERE has_ml),
      COUNT(*) FILTER (WHERE NOT has_ml),
      NOW()
    FROM warehouse_products
    WHERE warehouse_id = v_wh.warehouse_id
      AND warehouse_stock > 0
    ON CONFLICT (warehouse_id) DO UPDATE SET
      total_skus = EXCLUDED.total_skus,
      total_units = EXCLUDED.total_units,
      published_ml = EXCLUDED.published_ml,
      unpublished_ml = EXCLUDED.unpublished_ml,
      refreshed_at = NOW();

    v_refreshed := v_refreshed + 1;
    v_results := v_results || jsonb_build_object(
      'warehouse_id', v_wh.warehouse_id,
      'refreshed', true
    );
  END LOOP;

  RETURN jsonb_build_object('warehouses_refreshed', v_refreshed, 'details', v_results);
END;
$$;
