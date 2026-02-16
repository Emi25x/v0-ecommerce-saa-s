-- Migración: Gestión de peso desde MercadoLibre (IDEMPOTENTE)
-- Contexto: works = products (libro canónico), listings = ml_publications (publicaciones ML)
-- Objetivo: Almacenar peso de ML por publicación y consolidar en peso canónico por producto

-- 1) Crear enum weight_source (idempotente)
DO $$ BEGIN
    CREATE TYPE weight_source_enum AS ENUM ('meli', 'manual', 'inferred');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2) Agregar columnas a ml_publications (publicaciones de MercadoLibre)
ALTER TABLE ml_publications 
  ADD COLUMN IF NOT EXISTS meli_weight_g integer,
  ADD COLUMN IF NOT EXISTS weight_source weight_source_enum,
  ADD COLUMN IF NOT EXISTS weight_last_synced_at timestamptz;

-- Constraint de rango razonable para peso en publicaciones ML (50g a 30kg)
DO $$ BEGIN
    ALTER TABLE ml_publications 
      ADD CONSTRAINT ml_publications_weight_range_check 
      CHECK (meli_weight_g IS NULL OR (meli_weight_g >= 50 AND meli_weight_g <= 30000));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Comentarios descriptivos en ml_publications
COMMENT ON COLUMN ml_publications.meli_weight_g IS 'Peso en gramos obtenido desde MercadoLibre para esta publicación específica';
COMMENT ON COLUMN ml_publications.weight_source IS 'Fuente del peso: meli (API ML), manual (editado), inferred (calculado)';
COMMENT ON COLUMN ml_publications.weight_last_synced_at IS 'Última vez que se sincronizó el peso desde MercadoLibre';

-- 3) Agregar columnas a products (libro canónico)
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS canonical_weight_g integer,
  ADD COLUMN IF NOT EXISTS weight_confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS weight_updated_at timestamptz;

-- Constraints para products
DO $$ BEGIN
    ALTER TABLE products 
      ADD CONSTRAINT products_weight_range_check 
      CHECK (canonical_weight_g IS NULL OR (canonical_weight_g >= 50 AND canonical_weight_g <= 30000));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE products 
      ADD CONSTRAINT products_weight_confidence_check 
      CHECK (weight_confidence IS NULL OR (weight_confidence >= 0 AND weight_confidence <= 1));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Comentarios descriptivos en products
COMMENT ON COLUMN products.canonical_weight_g IS 'Peso canónico consolidado del libro en gramos (calculado desde publicaciones ML o ingresado manualmente)';
COMMENT ON COLUMN products.weight_confidence IS 'Nivel de confianza del peso canónico (0.0 - 1.0). 1.0 = múltiples fuentes coinciden, 0.5 = una sola fuente';
COMMENT ON COLUMN products.weight_updated_at IS 'Última actualización del peso canónico';

-- 4) Crear índices para búsquedas eficientes (idempotentes)
CREATE INDEX IF NOT EXISTS idx_ml_publications_meli_weight 
  ON ml_publications(meli_weight_g) 
  WHERE meli_weight_g IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_canonical_weight 
  ON products(canonical_weight_g) 
  WHERE canonical_weight_g IS NOT NULL;

-- Índice en ISBN para matching por identificador
CREATE INDEX IF NOT EXISTS idx_products_isbn 
  ON products(isbn) 
  WHERE isbn IS NOT NULL;

-- Índice compuesto para consolidación de peso por producto
CREATE INDEX IF NOT EXISTS idx_ml_publications_product_weight 
  ON ml_publications(product_id, meli_weight_g) 
  WHERE product_id IS NOT NULL AND meli_weight_g IS NOT NULL;

-- Comentarios finales
COMMENT ON TABLE ml_publications IS 'Publicaciones individuales de MercadoLibre, cada una con su propio peso meli_weight_g';
COMMENT ON TABLE products IS 'Productos/libros canónicos con peso consolidado canonical_weight_g calculado desde las publicaciones ML asociadas';
