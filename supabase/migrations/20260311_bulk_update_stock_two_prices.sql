-- bulk_update_stock_two_prices
-- Actualiza stock, cost_price (precio en divisa extranjera) y price (precio de venta local)
-- Usado por fuentes como Libral Argentina que proveen dos columnas de precio.

CREATE OR REPLACE FUNCTION bulk_update_stock_two_prices(
  p_eans        TEXT[],
  p_stocks      INT[],
  p_cost_prices NUMERIC[],
  p_prices      NUMERIC[]
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
      p_eans[i]        AS ean,
      p_stocks[i]      AS stock,
      p_cost_prices[i] AS cost_price,
      p_prices[i]      AS price
    FROM generate_series(1, v_total) AS i
  ),
  updated AS (
    UPDATE products p
    SET
      stock      = input.stock,
      cost_price = CASE WHEN input.cost_price IS NOT NULL AND input.cost_price > 0
                        THEN input.cost_price ELSE p.cost_price END,
      price      = CASE WHEN input.price IS NOT NULL AND input.price > 0
                        THEN input.price      ELSE p.price      END,
      updated_at = NOW()
    FROM input
    WHERE p.ean = input.ean
    RETURNING p.ean
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$;
