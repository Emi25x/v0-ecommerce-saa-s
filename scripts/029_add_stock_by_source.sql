-- Agregar sistema de stock por fuente de importación
-- Cada fuente tendrá su propia columna de stock y se calculará el total

-- Agregar columna para almacenar stock por fuente (JSONB)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_by_source JSONB DEFAULT '{}'::jsonb;

-- Agregar columna para stock total calculado
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_total INTEGER DEFAULT 0;

-- Crear función para calcular stock total desde stock_by_source
CREATE OR REPLACE FUNCTION calculate_total_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Sumar todos los valores de stock en el objeto JSON
  NEW.stock_total := (
    SELECT COALESCE(SUM((value)::integer), 0)
    FROM jsonb_each_text(NEW.stock_by_source)
  );
  
  -- Mantener la columna stock sincronizada con stock_total para compatibilidad
  NEW.stock := NEW.stock_total;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para actualizar stock_total automáticamente
DROP TRIGGER IF EXISTS update_stock_total ON products;
CREATE TRIGGER update_stock_total
  BEFORE INSERT OR UPDATE OF stock_by_source
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION calculate_total_stock();

-- Migrar stock existente a stock_by_source
-- Asumimos que el stock actual viene de una fuente "manual" o "legacy"
UPDATE products
SET stock_by_source = jsonb_build_object('legacy', COALESCE(stock, 0))
WHERE stock_by_source = '{}'::jsonb OR stock_by_source IS NULL;

-- Comentarios para documentación
COMMENT ON COLUMN products.stock_by_source IS 'Stock por fuente de importación en formato {"source_name": quantity}';
COMMENT ON COLUMN products.stock_total IS 'Stock total calculado automáticamente desde stock_by_source';
COMMENT ON FUNCTION calculate_total_stock() IS 'Calcula el stock total sumando todos los valores en stock_by_source';
