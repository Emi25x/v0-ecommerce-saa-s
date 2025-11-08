-- Create cache tables for performance optimization
CREATE TABLE IF NOT EXISTS ml_products_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES ml_accounts(id) ON DELETE CASCADE,
  ml_id TEXT NOT NULL,
  data JSONB NOT NULL,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour',
  UNIQUE(account_id, ml_id)
);

CREATE TABLE IF NOT EXISTS ml_orders_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES ml_accounts(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  data JSONB NOT NULL,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '15 minutes',
  UNIQUE(account_id, order_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ml_products_cache_account ON ml_products_cache(account_id);
CREATE INDEX IF NOT EXISTS idx_ml_products_cache_expires ON ml_products_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_ml_orders_cache_account ON ml_orders_cache(account_id);
CREATE INDEX IF NOT EXISTS idx_ml_orders_cache_expires ON ml_orders_cache(expires_at);

-- Create function to clean expired cache
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM ml_products_cache WHERE expires_at < NOW();
  DELETE FROM ml_orders_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
