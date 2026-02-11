-- Migración: Gestión de peso desde MercadoLibre
-- Agrega columnas para trackear peso de publicaciones ML y calcular peso canónico

-- 1. Crear ENUM para weight_source
CREATE TYPE weight_source_type AS ENUM ('meli', 'manual', 'inferred');

-- 2. Extender tabla ml_publications (listings de ML)
ALTER TABLE ml_publications 
ADD COLUMN meli_weight_g integer,
ADD COLUMN weight_source weight_source_type DEFAULT 'meli',
ADD COLUMN weight_last_synced_at timestamp with time zone;

-- Índices para búsquedas por peso
CREATE INDEX idx_ml_publications_weight_source ON ml_publications(weight_source);
CREATE INDEX idx_ml_publications_meli_weight ON ml_publications(meli_weight_g) WHERE meli_weight_g IS NOT NULL;

-- 3. Extender tabla products (works/productos canónicos)
ALTER TABLE products
ADD COLUMN canonical_weight_g integer,
ADD COLUMN weight_confidence real,
ADD COLUMN weight_updated_at timestamp with time zone;

-- Índices para análisis de peso
CREATE INDEX idx_products_canonical_weight ON products(canonical_weight_g) WHERE canonical_weight_g IS NOT NULL;

COMMENT ON COLUMN ml_publications.meli_weight_g IS 'Peso en gramos obtenido desde la API de MercadoLibre';
COMMENT ON COLUMN ml_publications.weight_source IS 'Origen del peso: meli (API ML), manual (editado), inferred (calculado)';
COMMENT ON COLUMN ml_publications.weight_last_synced_at IS 'Última vez que se sincronizó el peso desde ML';

COMMENT ON COLUMN products.canonical_weight_g IS 'Peso canónico calculado agregando pesos de listings de ML';
COMMENT ON COLUMN products.weight_confidence IS 'Confianza del peso canónico (0-1), basada en coincidencia de pesos de listings';
COMMENT ON COLUMN products.weight_updated_at IS 'Última actualización del peso canónico';
