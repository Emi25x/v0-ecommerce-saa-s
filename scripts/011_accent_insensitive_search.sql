-- Habilitar búsqueda sin tildes (accent-insensitive) en products
-- Requiere extensiones: unaccent + pg_trgm

-- 1) Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) Crear wrapper IMMUTABLE para unaccent (requerido para índices)
CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$func$
SELECT public.unaccent($1)
$func$;

-- 3) Índices trigram sobre columnas normalizadas (sin tildes)
-- Para title
CREATE INDEX IF NOT EXISTS products_title_unaccent_trgm_idx
  ON products USING gin ((f_unaccent(lower(title))) gin_trgm_ops);

-- Para sku (normalizado)
CREATE INDEX IF NOT EXISTS products_sku_unaccent_trgm_idx
  ON products USING gin ((f_unaccent(lower(sku))) gin_trgm_ops);

-- 3) Función RPC para búsqueda accent-insensitive
-- Esto permite que el frontend llame a supabase.rpc('search_products', {...})
CREATE OR REPLACE FUNCTION search_products(
  search_term TEXT,
  page_num INT DEFAULT 1,
  page_limit INT DEFAULT 50,
  sort_by TEXT DEFAULT 'updated_at',
  sort_order TEXT DEFAULT 'desc'
)
RETURNS TABLE (
  id UUID,
  sku TEXT,
  title TEXT,
  price NUMERIC,
  stock INTEGER,
  source TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  image_url TEXT,
  total_count BIGINT
) AS $$
DECLARE
  search_normalized TEXT;
  offset_val INT;
  is_numeric_code BOOLEAN;
BEGIN
  -- Calcular offset
  offset_val := (page_num - 1) * page_limit;
  
  -- Normalizar búsqueda (lowercase + sin tildes)
  search_normalized := f_unaccent(lower(trim(search_term)));
  
  -- Detectar si es código numérico largo (ISBN/EAN: 10+ dígitos)
  is_numeric_code := search_term ~ '^\d{10,}$';
  
  IF search_term IS NULL OR search_term = '' THEN
    -- Sin búsqueda: devolver todos ordenados
    RETURN QUERY
    SELECT 
      p.id, p.sku, p.title, p.price, p.stock, p.source, 
      p.created_at, p.updated_at, p.image_url,
      COUNT(*) OVER() AS total_count
    FROM products p
    ORDER BY 
      CASE WHEN sort_by = 'updated_at' AND sort_order = 'desc' THEN p.updated_at END DESC,
      CASE WHEN sort_by = 'updated_at' AND sort_order = 'asc' THEN p.updated_at END ASC,
      CASE WHEN sort_by = 'title' AND sort_order = 'desc' THEN p.title END DESC,
      CASE WHEN sort_by = 'title' AND sort_order = 'asc' THEN p.title END ASC,
      CASE WHEN sort_by = 'price' AND sort_order = 'desc' THEN p.price END DESC,
      CASE WHEN sort_by = 'price' AND sort_order = 'asc' THEN p.price END ASC,
      p.updated_at DESC
    LIMIT page_limit OFFSET offset_val;
    
  ELSIF is_numeric_code THEN
    -- Búsqueda exacta en códigos de barras (ISBN/EAN/GTIN)
    RETURN QUERY
    SELECT 
      p.id, p.sku, p.title, p.price, p.stock, p.source,
      p.created_at, p.updated_at, p.image_url,
      COUNT(*) OVER() AS total_count
    FROM products p
    WHERE p.ean = search_term 
       OR p.isbn = search_term 
       OR p.gtin = search_term 
       OR p.sku = search_term
    ORDER BY 
      CASE WHEN sort_by = 'updated_at' AND sort_order = 'desc' THEN p.updated_at END DESC,
      CASE WHEN sort_by = 'updated_at' AND sort_order = 'asc' THEN p.updated_at END ASC,
      p.updated_at DESC
    LIMIT page_limit OFFSET offset_val;
    
  ELSE
    -- Búsqueda fuzzy accent-insensitive en SKU y title
    RETURN QUERY
    SELECT 
      p.id, p.sku, p.title, p.price, p.stock, p.source,
      p.created_at, p.updated_at, p.image_url,
      COUNT(*) OVER() AS total_count
    FROM products p
    WHERE f_unaccent(lower(p.sku)) ILIKE '%' || search_normalized || '%'
       OR f_unaccent(lower(p.title)) ILIKE '%' || search_normalized || '%'
    ORDER BY 
      -- Priorizar match exacto en SKU
      CASE WHEN f_unaccent(lower(p.sku)) = search_normalized THEN 0 ELSE 1 END,
      CASE WHEN sort_by = 'updated_at' AND sort_order = 'desc' THEN p.updated_at END DESC,
      CASE WHEN sort_by = 'updated_at' AND sort_order = 'asc' THEN p.updated_at END ASC,
      CASE WHEN sort_by = 'title' AND sort_order = 'desc' THEN p.title END DESC,
      CASE WHEN sort_by = 'title' AND sort_order = 'asc' THEN p.title END ASC,
      p.updated_at DESC
    LIMIT page_limit OFFSET offset_val;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
