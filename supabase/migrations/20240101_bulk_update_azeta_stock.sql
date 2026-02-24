-- bulk_update_azeta_stock
-- Actualiza stock_by_source.azeta para un batch de EANs en una sola query
-- Retorna conteo de actualizados y no encontrados

CREATE OR REPLACE FUNCTION bulk_update_azeta_stock(
  p_eans TEXT[],
  p_stocks INT[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INT := 0;
  v_not_found INT := 0;
  v_total INT;
BEGIN
  v_total := array_length(p_eans, 1);
  IF v_total IS NULL THEN
    RETURN json_build_object('updated', 0, 'not_found', 0);
  END IF;

  -- Actualizar stock_by_source.azeta para todos los EANs del batch
  WITH input AS (
    SELECT
      p_eans[i] AS ean,
      p_stocks[i] AS stock
    FROM generate_series(1, v_total) AS i
  ),
  updated AS (
    UPDATE products p
    SET stock_by_source = COALESCE(p.stock_by_source, '{}'::jsonb) || jsonb_build_object('azeta', input.stock)
    FROM input
    WHERE p.ean = input.ean
    RETURNING p.ean
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  v_not_found := v_total - v_updated;

  RETURN json_build_object('updated', v_updated, 'not_found', v_not_found);
END;
$$;

-- bulk_update_stock_price (para Arnoia Stock - actualiza stock_by_source.arnoia y cost_price)
CREATE OR REPLACE FUNCTION bulk_update_stock_price(
  p_eans TEXT[],
  p_stocks INT[],
  p_prices NUMERIC[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INT := 0;
  v_total INT;
BEGIN
  v_total := array_length(p_eans, 1);
  IF v_total IS NULL THEN
    RETURN 0;
  END IF;

  WITH input AS (
    SELECT
      p_eans[i] AS ean,
      p_stocks[i] AS stock,
      p_prices[i] AS price
    FROM generate_series(1, v_total) AS i
  ),
  updated AS (
    UPDATE products p
    SET
      stock_by_source = COALESCE(p.stock_by_source, '{}'::jsonb) || jsonb_build_object('arnoia', input.stock),
      cost_price = CASE WHEN input.price IS NOT NULL AND input.price > 0 THEN input.price ELSE p.cost_price END
    FROM input
    WHERE p.ean = input.ean
    RETURNING p.ean
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$;
