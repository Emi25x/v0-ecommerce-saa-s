-- Función RPC para actualizar stock_by_source.azeta en bulk por array de EANs
-- Hace merge del JSONB: preserva otros proveedores (arnoia, etc.)
-- Retorna objeto { updated, not_found }
CREATE OR REPLACE FUNCTION bulk_update_azeta_stock(
  p_eans text[],
  p_stocks integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated int := 0;
  v_total   int;
BEGIN
  UPDATE products AS prod
  SET
    stock_by_source = COALESCE(prod.stock_by_source, '{}'::jsonb)
                      || jsonb_build_object('azeta', data.stock),
    updated_at = NOW()
  FROM (
    SELECT
      unnest(p_eans)   AS ean,
      unnest(p_stocks) AS stock
  ) AS data
  WHERE prod.ean = data.ean;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_total := COALESCE(array_length(p_eans, 1), 0);

  RETURN jsonb_build_object(
    'updated',   v_updated,
    'not_found', v_total - v_updated
  );
END;
$$;
