-- Agregar índices a products para mejorar rendimiento de búsquedas por identificadores
-- Estos índices son críticos para el matcher automático y la importación

-- Índice en SKU (único, ya existe por constraint)
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;

-- Índice en ISBN
CREATE INDEX IF NOT EXISTS idx_products_isbn ON products(isbn) WHERE isbn IS NOT NULL;

-- Índice en EAN
CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean) WHERE ean IS NOT NULL;
