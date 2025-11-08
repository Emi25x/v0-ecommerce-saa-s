-- Agregar índice en la columna source para mejorar el rendimiento del ordenamiento
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source);

-- Agregar índices adicionales para otras columnas comúnmente ordenadas
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
