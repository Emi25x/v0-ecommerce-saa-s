-- Agregar columna stock_by_source JSONB a products
-- Almacena stock de cada proveedor: {"azeta": 5, "arnoia": 3}
-- stock_total se calcula automáticamente como suma de todos

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_by_source JSONB DEFAULT '{}'::jsonb;

-- Migrar stock actual a stock_by_source si existe
-- Asumir que stock actual es de fuente "legacy"
UPDATE products 
SET stock_by_source = jsonb_build_object('legacy', COALESCE(stock, 0))
WHERE stock_by_source = '{}'::jsonb AND stock IS NOT NULL;

-- Crear función para calcular stock_total desde stock_by_source
CREATE OR REPLACE FUNCTION calculate_stock_total(stock_sources JSONB)
RETURNS INTEGER AS $$
DECLARE
  total INTEGER := 0;
  source_key TEXT;
  source_value JSONB;
BEGIN
  -- Sumar todos los valores numéricos en stock_by_source
  FOR source_key, source_value IN SELECT * FROM jsonb_each(stock_sources)
  LOOP
    IF jsonb_typeof(source_value) = 'number' THEN
      total := total + (source_value::TEXT)::INTEGER;
    END IF;
  END LOOP;
  
  RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Crear trigger para actualizar stock_total automáticamente
CREATE OR REPLACE FUNCTION sync_stock_total()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcular stock_total desde stock_by_source
  NEW.stock := calculate_stock_total(NEW.stock_by_source);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger en INSERT y UPDATE
DROP TRIGGER IF EXISTS trigger_sync_stock_total ON products;
CREATE TRIGGER trigger_sync_stock_total
  BEFORE INSERT OR UPDATE OF stock_by_source
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_stock_total();

-- Recalcular stock_total para productos existentes
UPDATE products 
SET stock = calculate_stock_total(stock_by_source)
WHERE stock_by_source IS NOT NULL;

-- Crear índice para búsquedas por proveedor
CREATE INDEX IF NOT EXISTS idx_products_stock_by_source 
ON products USING gin (stock_by_source);

COMMENT ON COLUMN products.stock_by_source IS 'Stock por proveedor en formato {"azeta": 5, "arnoia": 3}';
COMMENT ON COLUMN products.stock IS 'Stock total calculado automáticamente como suma de stock_by_source';
