-- Create table to cache MercadoLibre product details including SKU
CREATE TABLE IF NOT EXISTS ml_product_cache (
  id SERIAL PRIMARY KEY,
  ml_item_id TEXT NOT NULL UNIQUE,
  seller_sku TEXT,
  title TEXT,
  thumbnail TEXT,
  price DECIMAL(10, 2),
  available_quantity INTEGER,
  attributes JSONB,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ml_product_cache_item_id ON ml_product_cache(ml_item_id);
CREATE INDEX IF NOT EXISTS idx_ml_product_cache_cached_at ON ml_product_cache(cached_at);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_ml_product_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_ml_product_cache_updated_at ON ml_product_cache;
CREATE TRIGGER trigger_update_ml_product_cache_updated_at
  BEFORE UPDATE ON ml_product_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_ml_product_cache_updated_at();
