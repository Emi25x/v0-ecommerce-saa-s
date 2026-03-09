-- RPC: zero_azeta_stock_not_in_list(p_eans text[])
--
-- Pone stock_by_source.azeta = 0 en todos los productos cuyo EAN NO esté en la lista.
-- Se llama al final de cada corrida de Azeta Stock para reflejar que esos productos
-- ya no están disponibles en Azeta.
--
-- Preserva intacto el stock de todos los demás proveedores (arnoia, etc.).
-- Solo toca filas donde stock_by_source.azeta actualmente > 0 para evitar escrituras innecesarias.
--
-- Retorna: { "zeroed": <cantidad de filas actualizadas> }

CREATE OR REPLACE FUNCTION zero_azeta_stock_not_in_list(p_eans text[])
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_zeroed int := 0;
BEGIN
  UPDATE products
  SET
    stock_by_source = COALESCE(stock_by_source, '{}'::jsonb)
                      || jsonb_build_object('azeta', 0),
    updated_at = NOW()
  WHERE
    ean IS NOT NULL
    AND ean != ALL(p_eans)
    AND COALESCE((stock_by_source->>'azeta')::int, 0) > 0;

  GET DIAGNOSTICS v_zeroed = ROW_COUNT;

  RETURN jsonb_build_object('zeroed', v_zeroed);
END;
$$;
