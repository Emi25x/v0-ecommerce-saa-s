-- Función RPC para actualizar stock y precio en bulk por array de EANs
-- Retorna el número de filas actualizadas
CREATE OR REPLACE FUNCTION bulk_update_stock_price(
  p_eans text[],
  p_stocks int[],
  p_prices numeric[]
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count int := 0;
BEGIN
  UPDATE products AS prod
  SET
    stock = CASE 
      WHEN data.stock IS NOT NULL THEN data.stock::int
      ELSE prod.stock
    END,
    cost_price = CASE
      WHEN data.price IS NOT NULL THEN data.price::numeric
      ELSE prod.cost_price
    END,
    updated_at = NOW()
  FROM (
    SELECT
      unnest(p_eans)   AS ean,
      unnest(p_stocks) AS stock,
      unnest(p_prices) AS price
  ) AS data
  WHERE prod.ean = data.ean;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
