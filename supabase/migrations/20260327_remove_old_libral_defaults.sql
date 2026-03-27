-- Change default source_key from 'libral' to 'libral_argentina' in RPC functions.
-- The old "Libral" source has been deleted. Only "Libral Argentina" exists now.

CREATE OR REPLACE FUNCTION bulk_update_stock_two_prices(
  p_eans        TEXT[],
  p_stocks      INT[],
  p_prices      NUMERIC[],
  p_prices_ars  NUMERIC[],
  p_source_key  TEXT DEFAULT 'libral_argentina'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '60s'
AS $$
DECLARE
  v_updated INT := 0;
  v_total   INT;
BEGIN
  v_total := array_length(p_eans, 1);
  IF v_total IS NULL THEN
    RETURN 0;
  END IF;

  WITH input AS (
    SELECT
      p_eans[i]       AS ean,
      p_stocks[i]     AS stock,
      p_prices[i]     AS price,
      p_prices_ars[i] AS precio_ars
    FROM generate_series(1, v_total) AS i
  ),
  updated AS (
    UPDATE products p
    SET
      stock_by_source = COALESCE(p.stock_by_source, '{}'::jsonb)
                        || jsonb_build_object(p_source_key, input.stock::int),
      price        = CASE WHEN input.price IS NOT NULL AND input.price > 0
                          THEN input.price ELSE p.price END,
      custom_fields = jsonb_set(
                        COALESCE(p.custom_fields, '{}'::jsonb),
                        '{precio_ars}',
                        to_jsonb(input.precio_ars)
                      ),
      updated_at   = NOW()
    FROM input
    WHERE p.ean = input.ean
    RETURNING p.ean
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$;
