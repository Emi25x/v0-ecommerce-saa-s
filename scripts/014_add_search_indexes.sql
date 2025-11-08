-- Agregar índices para optimizar búsquedas en la tabla products
-- Estos índices mejoran significativamente el rendimiento de búsquedas por SKU, título y fuente

-- Índice para búsquedas por SKU (el más importante)
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- Índice para búsquedas por título
CREATE INDEX IF NOT EXISTS idx_products_title ON products(title);

-- Índice GIN para búsquedas en el array de fuentes
CREATE INDEX IF NOT EXISTS idx_products_source_gin ON products USING GIN(source);

-- Índice para ordenamiento por fecha de creación
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- Índice para ordenamiento por fecha de actualización
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at DESC);

-- Verificar que los índices se crearon correctamente
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'products'
ORDER BY indexname;
