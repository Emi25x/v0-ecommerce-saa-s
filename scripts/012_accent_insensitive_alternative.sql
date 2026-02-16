-- Solución alternativa para búsqueda sin tildes sin extensión unaccent
-- Usa función personalizada con TRANSLATE para normalizar

-- 1) Asegurar que pg_trgm existe
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) Función para normalizar texto (quitar tildes manualmente)
CREATE OR REPLACE FUNCTION normalize_text(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$func$
SELECT lower(translate($1,
  'áàâãäåāăąÁÀÂÃÄÅĀĂĄéèêëēĕėęěÉÈÊËĒĔĖĘĚíìîïĩīĭįıÍÌÎÏĨĪĬĮİóòôõöōŏőøÓÒÔÕÖŌŎŐØúùûüũūŭůűųÚÙÛÜŨŪŬŮŰŲýÿŷÝŸŶñÑçÇ',
  'aaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeiiiiiiiiiiiiiiiiooooooooooooooooouuuuuuuuuuuuuuuuyyyyynncс'
))
$func$;

-- 3) Índices trigram sobre columnas normalizadas
CREATE INDEX IF NOT EXISTS products_title_normalized_trgm_idx
  ON products USING gin ((normalize_text(title)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_sku_normalized_trgm_idx
  ON products USING gin ((normalize_text(sku)) gin_trgm_ops);

-- 4) Función RPC para búsqueda accent-insensitive
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
  offset_val := (page_num - 1) * page_limit;
  search_normalized := normalize_text(trim(search_term));
  is_numeric_code := search_term ~ '^\d{10,}$';
  
  IF search_term IS NULL OR search_term = '' THEN
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
      p.updated_at DESC
    LIMIT page_limit OFFSET offset_val;
    
  ELSIF is_numeric_code THEN
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
    ORDER BY p.updated_at DESC
    LIMIT page_limit OFFSET offset_val;
    
  ELSE
    RETURN QUERY
    SELECT 
      p.id, p.sku, p.title, p.price, p.stock, p.source,
      p.created_at, p.updated_at, p.image_url,
      COUNT(*) OVER() AS total_count
    FROM products p
    WHERE normalize_text(p.sku) ILIKE '%' || search_normalized || '%'
       OR normalize_text(p.title) ILIKE '%' || search_normalized || '%'
    ORDER BY 
      CASE WHEN normalize_text(p.sku) = search_normalized THEN 0 ELSE 1 END,
      CASE WHEN sort_by = 'updated_at' AND sort_order = 'desc' THEN p.updated_at END DESC,
      CASE WHEN sort_by = 'updated_at' AND sort_order = 'asc' THEN p.updated_at END ASC,
      p.updated_at DESC
    LIMIT page_limit OFFSET offset_val;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
