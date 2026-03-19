-- ============================================================================
-- Generic zero_source_stock_not_in_list: zeroes stock_by_source[source_key]
-- for products NOT in the provided EAN list.
-- Used by Arnoia stock import to zero-out products no longer in the feed.
-- Replaces the hardcoded zero_azeta_stock_not_in_list.
-- ============================================================================

CREATE OR REPLACE FUNCTION zero_source_stock_not_in_list(
  p_eans       text[],
  p_source_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_zeroed int := 0;
BEGIN
  IF p_source_key IS NULL OR p_source_key = '' THEN
    RETURN jsonb_build_object('zeroed', 0);
  END IF;

  UPDATE products
  SET
    stock_by_source = COALESCE(stock_by_source, '{}'::jsonb)
                      || jsonb_build_object(p_source_key, 0),
    updated_at = NOW()
  WHERE
    (stock_by_source->>p_source_key)::int > 0
    AND ean IS NOT NULL
    AND ean != ''
    AND ean != ALL(p_eans);

  GET DIAGNOSTICS v_zeroed = ROW_COUNT;

  RETURN jsonb_build_object('zeroed', v_zeroed);
END;
$$;
