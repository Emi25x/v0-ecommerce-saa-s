-- ============================================================
-- 050: Agregar UNIQUE constraint en products.ean
-- ============================================================
-- PROBLEMA: Todos los upsert(..., { onConflict: "ean" }) fallan
-- porque PostgREST requiere un UNIQUE constraint/index en la
-- columna para poder resolver conflictos.
--
-- PASOS:
--   1. Verificar si la columna ean existe
--   2. Limpiar duplicados (quedarse con el más reciente)
--   3. Crear UNIQUE INDEX en ean (WHERE ean IS NOT NULL)
-- ============================================================

-- Paso 1: Ver duplicados antes de limpiar (solo diagnóstico)
-- SELECT ean, COUNT(*) as cnt
-- FROM products
-- WHERE ean IS NOT NULL AND ean != ''
-- GROUP BY ean
-- HAVING COUNT(*) > 1
-- ORDER BY cnt DESC
-- LIMIT 20;

-- Paso 2: Eliminar duplicados, quedando solo el registro más reciente
DELETE FROM products
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY ean
             ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
           ) as rn
    FROM products
    WHERE ean IS NOT NULL AND ean != ''
  ) dupes
  WHERE rn > 1
);

-- Paso 3: Crear UNIQUE INDEX (parcial: solo donde ean no es null)
-- Esto permite que haya múltiples registros con ean=NULL
CREATE UNIQUE INDEX IF NOT EXISTS products_ean_unique
  ON products (ean)
  WHERE ean IS NOT NULL AND ean != '';

-- Paso 4: Verificar que se creó correctamente
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'products' AND indexname LIKE '%ean%';
