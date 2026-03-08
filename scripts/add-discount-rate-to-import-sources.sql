-- Add default_discount_rate to import_sources
-- Represents the discount % applied to PVP to derive cost_price for suppliers
-- that don't provide a real cost (e.g. AZETA).
-- Stored as a decimal: 0.45 = 45% discount -> cost = PVP * (1 - 0.45)

ALTER TABLE import_sources
  ADD COLUMN IF NOT EXISTS default_discount_rate numeric(6,4) DEFAULT NULL;

COMMENT ON COLUMN import_sources.default_discount_rate IS
  'Descuento sobre PVP para calcular cost_price cuando el proveedor no da costo real. '
  'Ej: 0.45 => cost_price = pvp * 0.55. NULL = usar precio del feed directamente.';

-- Set a sensible default for the AZETA source if it exists
UPDATE import_sources
SET default_discount_rate = 0.45
WHERE name ILIKE 'azeta%' AND default_discount_rate IS NULL;
