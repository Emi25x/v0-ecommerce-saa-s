-- ============================================================
-- Migración de seguridad: asegurar que TODO el pipeline de
-- stock multi-source esté completo.
--
-- Contexto: las funciones calculate_stock_total, sync_stock_total
-- y el trigger trigger_sync_stock_total fueron creados originalmente
-- en scripts/034_add_stock_by_source_jsonb.sql (aplicado manualmente),
-- pero no existían como migración formal. Esta migración garantiza
-- que existan idempotentemente.
-- ============================================================

-- 1. Columna stock_by_source en products
ALTER TABLE products
ADD COLUMN IF NOT EXISTS stock_by_source JSONB DEFAULT '{}'::jsonb;

-- 2. Función auxiliar: calculate_stock_total (IMMUTABLE, usada por trigger)
CREATE OR REPLACE FUNCTION calculate_stock_total(stock_sources JSONB)
RETURNS INTEGER AS $$
DECLARE
  total INTEGER := 0;
  source_key TEXT;
  source_value JSONB;
BEGIN
  FOR source_key, source_value IN SELECT * FROM jsonb_each(stock_sources)
  LOOP
    IF jsonb_typeof(source_value) = 'number' THEN
      total := total + (source_value::TEXT)::INTEGER;
    END IF;
  END LOOP;
  RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Trigger function: sync_stock_total
CREATE OR REPLACE FUNCTION sync_stock_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.stock := calculate_stock_total(NEW.stock_by_source);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger en products (idempotente)
DROP TRIGGER IF EXISTS trigger_sync_stock_total ON products;
CREATE TRIGGER trigger_sync_stock_total
  BEFORE INSERT OR UPDATE OF stock_by_source
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_stock_total();

-- 5. GIN index para queries JSONB
CREATE INDEX IF NOT EXISTS idx_products_stock_by_source
ON products USING gin (stock_by_source);

-- 6. bulk_update_stock_price con p_source_key (idempotente via CREATE OR REPLACE)
--    Versión final: 4 params (eans, stocks, prices, source_key)
CREATE OR REPLACE FUNCTION bulk_update_stock_price(
  p_eans TEXT[],
  p_stocks INT[],
  p_prices NUMERIC[],
  p_source_key TEXT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  updated_count INT := 0;
  i INT;
BEGIN
  FOR i IN 1..array_length(p_eans, 1)
  LOOP
    IF p_source_key IS NOT NULL THEN
      UPDATE products
      SET stock_by_source = COALESCE(stock_by_source, '{}'::jsonb)
                            || jsonb_build_object(p_source_key, p_stocks[i]),
          cost_price = CASE WHEN p_prices[i] > 0 THEN p_prices[i] ELSE cost_price END,
          updated_at = NOW()
      WHERE ean = p_eans[i];
    ELSE
      UPDATE products
      SET stock = p_stocks[i],
          cost_price = CASE WHEN p_prices[i] > 0 THEN p_prices[i] ELSE cost_price END,
          updated_at = NOW()
      WHERE ean = p_eans[i];
    END IF;

    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- 7. bulk_update_azeta_stock (JSONB-aware)
CREATE OR REPLACE FUNCTION bulk_update_azeta_stock(
  p_eans TEXT[],
  p_stocks INT[]
)
RETURNS JSONB AS $$
DECLARE
  updated_count INT := 0;
  not_found_count INT := 0;
  i INT;
BEGIN
  FOR i IN 1..array_length(p_eans, 1)
  LOOP
    UPDATE products
    SET stock_by_source = COALESCE(stock_by_source, '{}'::jsonb)
                          || jsonb_build_object('azeta', p_stocks[i]),
        updated_at = NOW()
    WHERE ean = p_eans[i];

    IF FOUND THEN
      updated_count := updated_count + 1;
    ELSE
      not_found_count := not_found_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', updated_count, 'not_found', not_found_count);
END;
$$ LANGUAGE plpgsql;

-- 8. zero_azeta_stock_not_in_list (JSONB-aware)
CREATE OR REPLACE FUNCTION zero_azeta_stock_not_in_list(p_eans TEXT[])
RETURNS JSONB AS $$
DECLARE
  zeroed_count INT;
BEGIN
  UPDATE products
  SET stock_by_source = COALESCE(stock_by_source, '{}'::jsonb)
                        || jsonb_build_object('azeta', 0),
      updated_at = NOW()
  WHERE ean != ALL(p_eans)
    AND (stock_by_source->>'azeta')::int > 0;

  GET DIAGNOSTICS zeroed_count = ROW_COUNT;
  RETURN jsonb_build_object('zeroed', zeroed_count);
END;
$$ LANGUAGE plpgsql;

-- 9. zero_source_stock_not_in_list (genérica, para cualquier source)
CREATE OR REPLACE FUNCTION zero_source_stock_not_in_list(
  p_eans TEXT[],
  p_source_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  zeroed_count INT;
BEGIN
  SET LOCAL statement_timeout = '120s';

  UPDATE products
  SET stock_by_source = COALESCE(stock_by_source, '{}'::jsonb)
                        || jsonb_build_object(p_source_key, 0),
      updated_at = NOW()
  WHERE ean != ALL(p_eans)
    AND (stock_by_source->>p_source_key)::int > 0;

  GET DIAGNOSTICS zeroed_count = ROW_COUNT;
  RETURN jsonb_build_object('zeroed', zeroed_count);
END;
$$ LANGUAGE plpgsql;

-- 10. bulk_update_stock_two_prices (Libral dual-currency, JSONB-aware)
CREATE OR REPLACE FUNCTION bulk_update_stock_two_prices(
  p_eans TEXT[],
  p_stocks INT[],
  p_prices NUMERIC[],
  p_prices_ars NUMERIC[],
  p_source_key TEXT DEFAULT 'libral'
)
RETURNS INT AS $$
DECLARE
  updated_count INT := 0;
  i INT;
BEGIN
  FOR i IN 1..array_length(p_eans, 1)
  LOOP
    UPDATE products
    SET stock_by_source = COALESCE(stock_by_source, '{}'::jsonb)
                          || jsonb_build_object(p_source_key, p_stocks[i]),
        price = CASE WHEN p_prices[i] > 0 THEN p_prices[i] ELSE price END,
        custom_fields = COALESCE(custom_fields, '{}'::jsonb)
                        || jsonb_build_object('precio_ars', p_prices_ars[i]),
        updated_at = NOW()
    WHERE ean = p_eans[i];

    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- 11. source_key en import_sources
ALTER TABLE import_sources
ADD COLUMN IF NOT EXISTS source_key TEXT;

-- 12. Columnas token en integration_configs
ALTER TABLE integration_configs
ADD COLUMN IF NOT EXISTS token TEXT;

ALTER TABLE integration_configs
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
