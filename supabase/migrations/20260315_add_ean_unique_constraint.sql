-- Add UNIQUE constraint on products.ean
--
-- Causa del bug: runCatalogImport usa upsert(..., { onConflict: "ean" }) que
-- en PostgreSQL requiere un UNIQUE constraint o unique index — un índice regular
-- no alcanza.  Sin la constraint, cada batch falla silenciosamente con:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- → processed sube a 973k pero created/updated quedan en 0.
--
-- Pasos:
--   1. Eliminar duplicados (conservar el producto con updated_at más reciente)
--   2. Agregar columna ean si no existe (por si la DB está en estado inicial)
--   3. Crear UNIQUE constraint en products.ean

-- Paso 1: deduplicar — conservar la fila con mayor updated_at por ean
DELETE FROM products
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY ean
        ORDER BY updated_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM products
    WHERE ean IS NOT NULL AND ean != ''
  ) ranked
  WHERE rn > 1
);

-- Paso 2: agregar columna si no existe
ALTER TABLE products ADD COLUMN IF NOT EXISTS ean TEXT;

-- Paso 3: constraint UNIQUE (permite múltiples NULL — solo unicidad en no-nulos)
ALTER TABLE products
  ADD CONSTRAINT products_ean_unique UNIQUE (ean);
