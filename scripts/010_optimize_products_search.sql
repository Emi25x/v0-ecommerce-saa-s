-- Optimización de búsqueda en tabla products
-- Habilitar extensión pg_trgm para búsqueda de texto eficiente
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices exactos para búsquedas de identificadores
CREATE INDEX IF NOT EXISTS products_sku_idx ON products (sku);
CREATE INDEX IF NOT EXISTS products_sku_upper_idx ON products (UPPER(sku));

-- Índices para columnas de identificación si existen
DO $$
BEGIN
  -- Intentar crear índice en ean si la columna existe
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'ean') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_ean_idx ON products (ean)';
  END IF;
  
  -- Intentar crear índice en isbn si la columna existe
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'isbn') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_isbn_idx ON products (isbn)';
  END IF;
  
  -- Intentar crear índice en gtin si la columna existe
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'gtin') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_gtin_idx ON products (gtin)';
  END IF;
END $$;

-- Índices trigram para búsqueda parcial (fuzzy search)
CREATE INDEX IF NOT EXISTS products_title_trgm_idx ON products USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_sku_trgm_idx ON products USING gin (sku gin_trgm_ops);

-- Índices para ordenamiento y paginación eficientes
CREATE INDEX IF NOT EXISTS products_created_at_idx ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS products_updated_at_idx ON products (updated_at DESC);
CREATE INDEX IF NOT EXISTS products_price_idx ON products (price);
CREATE INDEX IF NOT EXISTS products_stock_idx ON products (stock);

-- Índice compuesto para queries comunes (listado con ordenamiento)
CREATE INDEX IF NOT EXISTS products_id_created_at_idx ON products (id, created_at DESC);
