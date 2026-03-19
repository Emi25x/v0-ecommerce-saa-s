-- ============================================================================
-- Fix: Add ALL missing columns to products and shopify_stores tables.
-- Without these, Azeta import fails (all rows rejected) and Shopify push
-- returns "Tienda no encontrada" because the SELECT queries fail.
-- ============================================================================

-- ── products table ──────────────────────────────────────────────────────────
-- Used by Azeta catalog import and Shopify push-product
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS pvp_editorial DECIMAL(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS year_edition TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS isbn TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS binding TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pages INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS edition_date TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ibic_subjects TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS course TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS height DECIMAL(8, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS width DECIMAL(8, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS thickness DECIMAL(8, 2);

CREATE INDEX IF NOT EXISTS idx_products_author ON products(author);
CREATE INDEX IF NOT EXISTS idx_products_isbn ON products(isbn) WHERE isbn IS NOT NULL;

-- ── shopify_stores table ────────────────────────────────────────────────────
-- Used by push-product and store settings
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS api_key TEXT;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS api_secret TEXT;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ARS';
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS api_version TEXT DEFAULT '2024-01';
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS product_category TEXT DEFAULT 'Media > Books > Print Books';
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS price_source TEXT DEFAULT 'products.price';
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS price_list_id UUID;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS default_warehouse_id UUID;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS sucursal_stock_code TEXT;
