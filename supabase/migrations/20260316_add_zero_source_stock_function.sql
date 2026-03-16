-- Generic zero-out function: sets stock_by_source[source_key] = 0
-- for products NOT in the provided EAN list.
-- Works for any source (Arnoia, Azeta, Libral, etc.)
-- Preserves stock from other sources.

CREATE OR REPLACE FUNCTION zero_source_stock_not_in_list(
  p_eans       text[],
  p_source_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_zeroed int := 0;
BEGIN
  IF p_source_key IS NULL OR p_source_key = '' THEN
    RETURN jsonb_build_object('zeroed', 0, 'error', 'source_key is required');
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
