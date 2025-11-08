-- Agregar constraint UNIQUE al campo SKU si no existe
-- Esto es necesario para que el upsert funcione correctamente

-- Primero, eliminar duplicados si existen
DELETE FROM products a USING products b
WHERE a.id > b.id AND a.sku = b.sku;

-- Agregar la constraint UNIQUE
ALTER TABLE products
ADD CONSTRAINT products_sku_unique UNIQUE (sku);

-- Crear índice para mejorar el rendimiento de búsquedas por SKU
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
