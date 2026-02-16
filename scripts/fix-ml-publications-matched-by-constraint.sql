-- Actualizar constraint de ml_publications para permitir isbn y ean
-- El matcher usa ISBN, EAN, SKU (y antes GTIN pero products no tiene esa columna)

-- Eliminar constraint antiguo
ALTER TABLE ml_publications DROP CONSTRAINT IF EXISTS ml_publications_matched_by_check;

-- Crear nuevo constraint con todos los valores válidos
ALTER TABLE ml_publications ADD CONSTRAINT ml_publications_matched_by_check 
  CHECK (matched_by = ANY (ARRAY['isbn'::text, 'ean'::text, 'sku'::text, 'gtin'::text]));

-- Comentario
COMMENT ON CONSTRAINT ml_publications_matched_by_check ON ml_publications IS 
  'Ensures matched_by contains only valid identifier types used by the matcher: isbn, ean, sku, gtin';
