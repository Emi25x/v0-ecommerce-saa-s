-- ─────────────────────────────────────────────────────────────────────────────
-- 048_ml_catalog_linked_item.sql
-- Agrega columna catalog_linked_item_id a ml_publications para rastrear
-- si una publicación tradicional ya tiene una publicación de catálogo asociada.
--
-- PROBLEMA: el filtro "elegibles catálogo" solo excluía items con
-- catalog_listing = true (la publicación de catálogo en sí misma).
-- Pero la publicación ORIGINAL (traditional) tiene catalog_listing = false
-- y catalog_listing_eligible = true, y aunque ya tiene una publicación de
-- catálogo hermana en listing_relationships, seguía apareciendo como elegible.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Agregar columna
ALTER TABLE ml_publications
  ADD COLUMN IF NOT EXISTS catalog_linked_item_id TEXT;

COMMENT ON COLUMN ml_publications.catalog_linked_item_id IS
  'ML item ID de la publicación de catálogo asociada (hermana). '
  'Si está lleno, esta publicación ya tiene opt-in de catálogo realizado.';

-- 2. Backfill desde listing_relationships existentes
UPDATE ml_publications p
   SET catalog_linked_item_id = r.catalog_listing_id
  FROM listing_relationships r
 WHERE p.ml_item_id = r.original_listing_id
   AND p.catalog_linked_item_id IS NULL;

-- 3. Trigger: auto-actualizar cuando se crea una nueva relación
CREATE OR REPLACE FUNCTION fn_sync_catalog_linked_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ml_publications
     SET catalog_linked_item_id = NEW.catalog_listing_id
   WHERE ml_item_id = NEW.original_listing_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_catalog_linked_item ON listing_relationships;
CREATE TRIGGER trg_sync_catalog_linked_item
  AFTER INSERT ON listing_relationships
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_catalog_linked_item();

-- 4. Índice para los filtros de la ruta de publicaciones
CREATE INDEX IF NOT EXISTS idx_ml_publications_catalog_linked
  ON ml_publications (catalog_linked_item_id)
  WHERE catalog_linked_item_id IS NOT NULL;
