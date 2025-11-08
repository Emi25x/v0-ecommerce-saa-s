-- Add custom_fields JSONB column to products table for storing dynamic custom fields
-- This allows storing any custom fields from CSV imports without needing to create new columns

ALTER TABLE products
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- Add index for better performance when querying custom fields
CREATE INDEX IF NOT EXISTS idx_products_custom_fields ON products USING gin(custom_fields);

-- Add comment
COMMENT ON COLUMN products.custom_fields IS 'Stores custom fields from CSV imports as JSON (e.g., {"altura": "10cm", "marca": "Nike"})';
