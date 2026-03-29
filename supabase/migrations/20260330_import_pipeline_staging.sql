-- ============================================================================
-- IMPORT PIPELINE: Staging + Merge architecture for large imports
--
-- Phases:
-- 1. STAGE: bulk INSERT raw rows into import_staging (fast, no validation)
-- 2. VALIDATE: mark invalid rows (missing EAN, bad stock, etc.)
-- 3. MERGE: single SQL UPDATE from staging → products (no row-by-row)
-- 4. ZERO: set stock=0 for products NOT in staging (efficient anti-join)
-- 5. CLEANUP: delete staging rows, update summary
-- ============================================================================

-- 0. Critical missing index
CREATE INDEX IF NOT EXISTS idx_products_ean ON products (ean);

-- 1. Staging table (truncated per run)
CREATE TABLE IF NOT EXISTS import_staging (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL,
  source_id UUID NOT NULL,
  line_number INTEGER,
  ean TEXT,
  sku TEXT,
  title TEXT,
  stock INTEGER,
  price NUMERIC,
  price_ars NUMERIC,
  raw_data JSONB,
  is_valid BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staging_run ON import_staging (run_id);
CREATE INDEX IF NOT EXISTS idx_staging_ean ON import_staging (run_id, ean) WHERE is_valid = TRUE;

-- 2. Rejects table (persists after import for debugging)
CREATE TABLE IF NOT EXISTS import_rejects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  source_id UUID NOT NULL,
  source_name TEXT,
  line_number INTEGER,
  ean TEXT,
  raw_data JSONB,
  error_message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rejects_run ON import_rejects (run_id);

-- 2b. Copy invalid rows from staging to rejects (for post-mortem debugging)
CREATE OR REPLACE FUNCTION copy_staging_rejects(
  p_run_id UUID,
  p_source_id UUID,
  p_source_name TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count INT;
BEGIN
  INSERT INTO import_rejects (run_id, source_id, source_name, line_number, ean, raw_data, error_message)
  SELECT run_id, source_id, p_source_name, line_number, ean, raw_data, error_message
  FROM import_staging
  WHERE run_id = p_run_id AND is_valid = FALSE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 2c. Validate EAN lengths in staging
CREATE OR REPLACE FUNCTION validate_staging_eans(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE import_staging
  SET is_valid = FALSE, error_message = 'EAN length != 13: ' || COALESCE(ean, '(null)')
  WHERE run_id = p_run_id AND is_valid = TRUE AND ean IS NOT NULL AND length(ean) != 13;
END;
$$;

-- 3. Merge function: staging → products (single SQL operation)
CREATE OR REPLACE FUNCTION merge_staging_to_products(
  p_run_id UUID,
  p_source_key TEXT,
  p_mode TEXT DEFAULT 'stock_only' -- 'stock_only' or 'catalog'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '300s'
AS $$
DECLARE
  v_updated INT := 0;
  v_created INT := 0;
  v_skipped INT := 0;
BEGIN
  IF p_mode = 'stock_only' THEN
    -- Stock-only mode: UPDATE existing products, never create
    WITH staged AS (
      SELECT DISTINCT ON (ean) ean, stock, price, price_ars
      FROM import_staging
      WHERE run_id = p_run_id AND is_valid = TRUE AND ean IS NOT NULL
      ORDER BY ean, line_number DESC
    ),
    updated AS (
      UPDATE products p
      SET
        stock_by_source = COALESCE(p.stock_by_source, '{}'::jsonb)
                          || jsonb_build_object(p_source_key, COALESCE(s.stock, 0)),
        cost_price = CASE WHEN s.price IS NOT NULL AND s.price > 0 THEN s.price ELSE p.cost_price END,
        custom_fields = CASE
          WHEN s.price_ars IS NOT NULL THEN
            jsonb_set(COALESCE(p.custom_fields, '{}'::jsonb), '{precio_ars}', to_jsonb(s.price_ars))
          ELSE p.custom_fields
        END,
        updated_at = NOW()
      FROM staged s
      WHERE p.ean = s.ean
        AND (
          -- Only update if something actually changed
          COALESCE((p.stock_by_source->>p_source_key)::int, -1) IS DISTINCT FROM COALESCE(s.stock, 0)
          OR (s.price IS NOT NULL AND s.price > 0 AND p.cost_price IS DISTINCT FROM s.price)
          OR (s.price_ars IS NOT NULL AND (p.custom_fields->>'precio_ars')::numeric IS DISTINCT FROM s.price_ars)
        )
      RETURNING p.id
    )
    SELECT COUNT(*) INTO v_updated FROM updated;

    -- Count skipped (EANs not found in products)
    SELECT COUNT(*) INTO v_skipped
    FROM (
      SELECT DISTINCT ean FROM import_staging
      WHERE run_id = p_run_id AND is_valid = TRUE AND ean IS NOT NULL
    ) s
    WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.ean = s.ean);

  ELSIF p_mode = 'catalog' THEN
    -- Catalog mode: UPSERT (create or update)
    WITH staged AS (
      SELECT DISTINCT ON (ean) ean, sku, title, stock, price, price_ars
      FROM import_staging
      WHERE run_id = p_run_id AND is_valid = TRUE AND ean IS NOT NULL
      ORDER BY ean, line_number DESC
    )
    INSERT INTO products (ean, sku, title, stock, cost_price, stock_by_source, updated_at)
    SELECT
      s.ean,
      COALESCE(s.sku, s.ean),
      COALESCE(s.title, s.ean),
      COALESCE(s.stock, 0),
      s.price,
      jsonb_build_object(p_source_key, COALESCE(s.stock, 0)),
      NOW()
    FROM staged s
    ON CONFLICT (ean) DO UPDATE SET
      stock_by_source = COALESCE(products.stock_by_source, '{}'::jsonb)
                        || jsonb_build_object(p_source_key, COALESCE(EXCLUDED.stock, 0)),
      cost_price = CASE WHEN EXCLUDED.cost_price IS NOT NULL AND EXCLUDED.cost_price > 0
                        THEN EXCLUDED.cost_price ELSE products.cost_price END,
      title = CASE WHEN EXCLUDED.title IS NOT NULL AND EXCLUDED.title != EXCLUDED.ean
                   THEN EXCLUDED.title ELSE products.title END,
      updated_at = NOW();

    GET DIAGNOSTICS v_created = ROW_COUNT;
    -- v_created includes both inserts and updates (ON CONFLICT)
  END IF;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'created', v_created,
    'skipped', v_skipped
  );
END;
$$;

-- 4. Zero function: efficient anti-join (no array parameter)
CREATE OR REPLACE FUNCTION zero_stock_from_staging(
  p_run_id UUID,
  p_source_key TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_zeroed INT;
BEGIN
  -- Zero products that have stock for this source but are NOT in staging
  UPDATE products p
  SET
    stock_by_source = COALESCE(p.stock_by_source, '{}'::jsonb)
                      || jsonb_build_object(p_source_key, 0),
    updated_at = NOW()
  WHERE (p.stock_by_source->>p_source_key)::int > 0
    AND NOT EXISTS (
      SELECT 1 FROM import_staging s
      WHERE s.run_id = p_run_id AND s.is_valid = TRUE AND s.ean = p.ean
    );

  GET DIAGNOSTICS v_zeroed = ROW_COUNT;
  RETURN v_zeroed;
END;
$$;

-- 5. Cleanup function
CREATE OR REPLACE FUNCTION cleanup_staging(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM import_staging WHERE run_id = p_run_id;
END;
$$;
