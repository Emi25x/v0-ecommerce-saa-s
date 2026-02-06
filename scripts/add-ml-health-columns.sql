-- Agregar columnas para filtros de salud y competencia de ML
ALTER TABLE ml_publications
ADD COLUMN IF NOT EXISTS catalog_listing_eligible boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_competing boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS price_to_win numeric,
ADD COLUMN IF NOT EXISTS health_checked_at timestamp with time zone;

-- Crear índices para mejorar performance de filtros
CREATE INDEX IF NOT EXISTS idx_ml_publications_catalog_eligible ON ml_publications(catalog_listing_eligible);
CREATE INDEX IF NOT EXISTS idx_ml_publications_competing ON ml_publications(is_competing);

COMMENT ON COLUMN ml_publications.catalog_listing_eligible IS 'Publicación elegible para competir en catálogo';
COMMENT ON COLUMN ml_publications.is_competing IS 'Publicación compitiendo (necesita ganar)';
COMMENT ON COLUMN ml_publications.price_to_win IS 'Precio necesario para ganar la competencia';
COMMENT ON COLUMN ml_publications.health_checked_at IS 'Última vez que se verificó el health status';
