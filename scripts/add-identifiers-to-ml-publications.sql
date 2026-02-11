-- Agregar columnas de identificadores esenciales a ml_publications
ALTER TABLE ml_publications 
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS isbn TEXT,
ADD COLUMN IF NOT EXISTS gtin TEXT,
ADD COLUMN IF NOT EXISTS ean TEXT;

-- Crear índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_ml_publications_sku ON ml_publications(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_publications_isbn ON ml_publications(isbn) WHERE isbn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_publications_gtin ON ml_publications(gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_publications_ean ON ml_publications(ean) WHERE ean IS NOT NULL;
