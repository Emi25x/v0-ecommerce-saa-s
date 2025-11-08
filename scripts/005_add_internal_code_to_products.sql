-- Add internal_code field to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS internal_code TEXT UNIQUE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_products_internal_code ON products(internal_code);

-- Generate internal codes for existing products that don't have one
UPDATE products 
SET internal_code = 'INT-' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0')
WHERE internal_code IS NULL;
