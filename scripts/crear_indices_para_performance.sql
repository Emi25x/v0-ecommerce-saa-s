-- ============================================
-- CREAR ÍNDICES PARA MEJORAR PERFORMANCE
-- ============================================
-- Este script crea índices en la tabla products para evitar timeouts
-- Ejecuta esto en Supabase SQL Editor

-- Índice para búsquedas por SKU (usado en análisis de duplicados)
CREATE INDEX IF NOT EXISTS idx_products_sku_lower ON products (LOWER(TRIM(sku)));

-- Índice para ordenar por ID
CREATE INDEX IF NOT EXISTS idx_products_id ON products (id DESC);

-- Índice para ordenar por created_at
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);

-- Eliminadas referencias a source_id que no existe en el schema
-- Índice compuesto para análisis de duplicados (SKU + fecha)
CREATE INDEX IF NOT EXISTS idx_products_sku_created ON products (LOWER(TRIM(sku)), created_at ASC);

-- Ver el progreso de creación de índices
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'products'
ORDER BY indexname;

SELECT 'Índices creados exitosamente. Las queries ahora serán mucho más rápidas.' as status;
