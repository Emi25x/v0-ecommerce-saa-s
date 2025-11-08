-- Create products table (master product data)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ml_accounts table (Mercado Libre accounts)
CREATE TABLE IF NOT EXISTS ml_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_user_id TEXT UNIQUE NOT NULL,
  nickname TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ml_listings table (Mercado Libre publications)
CREATE TABLE IF NOT EXISTS ml_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_id TEXT UNIQUE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  account_id UUID REFERENCES ml_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  listing_type TEXT,
  catalog_listing BOOLEAN DEFAULT FALSE,
  catalog_product_id TEXT,
  price DECIMAL(10, 2),
  available_quantity INTEGER,
  sold_quantity INTEGER DEFAULT 0,
  permalink TEXT,
  thumbnail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create listing_relationships table (relationships between original and catalog listings)
CREATE TABLE IF NOT EXISTS listing_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_listing_id UUID REFERENCES ml_listings(id) ON DELETE CASCADE,
  catalog_listing_id UUID REFERENCES ml_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(original_listing_id, catalog_listing_id)
);

-- Create stock_sources table (stock sources like Shopify, manual, etc.)
CREATE TABLE IF NOT EXISTS stock_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'shopify', 'manual', 'api', etc.
  config JSONB, -- configuration for the source
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create stock_sync_log table (history of stock synchronizations)
CREATE TABLE IF NOT EXISTS stock_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES ml_listings(id) ON DELETE CASCADE,
  old_quantity INTEGER,
  new_quantity INTEGER,
  source TEXT, -- 'manual', 'shopify', 'auto_sync', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_ml_listings_ml_id ON ml_listings(ml_id);
CREATE INDEX IF NOT EXISTS idx_ml_listings_product_id ON ml_listings(product_id);
CREATE INDEX IF NOT EXISTS idx_ml_listings_account_id ON ml_listings(account_id);
CREATE INDEX IF NOT EXISTS idx_listing_relationships_original ON listing_relationships(original_listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_relationships_catalog ON listing_relationships(catalog_listing_id);
CREATE INDEX IF NOT EXISTS idx_stock_sync_log_listing_id ON stock_sync_log(listing_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to update updated_at automatically
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ml_accounts_updated_at BEFORE UPDATE ON ml_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ml_listings_updated_at BEFORE UPDATE ON ml_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_sources_updated_at BEFORE UPDATE ON stock_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
