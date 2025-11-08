-- Add missing fields to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS internal_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'new',
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS source TEXT;

-- Create index for internal_code
CREATE INDEX IF NOT EXISTS idx_products_internal_code ON products(internal_code);

-- Create index for source
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source);
