-- Fix bulk_update_azeta_stock: actualiza stock_by_source['azeta'] via JSONB merge
-- y recalcula products.stock como suma de todos los proveedores.
--
-- El trigger trigger_sync_stock_total dispara cuando se toca stock_by_source
-- y recalcula stock = sum(stock_by_source.*) automáticamente.
--
-- La versión anterior (20240101) seteaba products.stock directamente, NUNCA
-- tocaba stock_by_source → el trigger no disparaba → los almacenes veían 0.

CREATE OR REPLACE FUNCTION bulk_update_azeta_stock(
  p_eans    text[],
  p_stocks  integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated int := 0;
  v_total   int;
BEGIN
  v_total := COALESCE(array_length(p_eans, 1), 0);
  IF v_total = 0 THEN
    RETURN jsonb_build_object('updated', 0, 'not_found', 0);
  END IF;

  -- Merge stock_by_source['azeta'] = nuevo_stock preservando otros proveedores.
  -- El trigger sync_stock_total recalcula products.stock automáticamente.
  UPDATE products AS prod
  SET
    stock_by_source = COALESCE(prod.stock_by_source, '{}'::jsonb)
                      || jsonb_build_object('azeta', data.stock::int),
    updated_at = NOW()
  FROM (
    SELECT
      unnest(p_eans)   AS ean,
      unnest(p_stocks) AS stock
  ) AS data
  WHERE prod.ean = data.ean;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'updated',   v_updated,
    'not_found', v_total - v_updated
  );
END;
$$;

-- Fix zero_azeta_stock_not_in_list: también debe usar JSONB merge
CREATE OR REPLACE FUNCTION zero_azeta_stock_not_in_list(p_eans text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_zeroed int := 0;
BEGIN
  -- Setear stock_by_source['azeta'] = 0 en productos que NO están en la lista
  -- (ya no disponibles en Azeta). Preserva stock de otros proveedores.
  UPDATE products
  SET
    stock_by_source = COALESCE(stock_by_source, '{}'::jsonb)
                      || '{"azeta": 0}'::jsonb,
    updated_at = NOW()
  WHERE
    -- Solo productos que tenían stock Azeta > 0
    (stock_by_source->>'azeta')::int > 0
    AND ean IS NOT NULL
    AND ean != ''
    AND ean != ALL(p_eans);

  GET DIAGNOSTICS v_zeroed = ROW_COUNT;

  RETURN jsonb_build_object('zeroed', v_zeroed);
END;
$$;

-- Fix bulk_update_stock_price (Arnoia): también debe actualizar stock_by_source
-- El source_key se pasa como parámetro opcional; si no se pasa, solo actualiza stock.
DROP FUNCTION IF EXISTS bulk_update_stock_price(text[], int[], numeric[]);
CREATE OR REPLACE FUNCTION bulk_update_stock_price(
  p_eans       text[],
  p_stocks     int[],
  p_prices     numeric[],
  p_source_key text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '60s'
AS $$
DECLARE
  v_updated int := 0;
  v_total   int;
BEGIN
  v_total := COALESCE(array_length(p_eans, 1), 0);
  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  IF p_source_key IS NOT NULL AND p_source_key != '' THEN
    -- Con source_key: actualizar stock_by_source[key] (trigger recalcula stock total)
    UPDATE products AS prod
    SET
      stock_by_source = COALESCE(prod.stock_by_source, '{}'::jsonb)
                        || jsonb_build_object(p_source_key, data.stock::int),
      cost_price = CASE
        WHEN data.price IS NOT NULL AND data.price > 0 THEN data.price
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
  ELSE
    -- Sin source_key: actualizar stock directo (legacy, sin JSONB)
    UPDATE products AS prod
    SET
      stock = data.stock,
      cost_price = CASE
        WHEN data.price IS NOT NULL AND data.price > 0 THEN data.price
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
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
