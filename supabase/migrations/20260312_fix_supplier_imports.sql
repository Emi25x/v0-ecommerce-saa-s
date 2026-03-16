-- ============================================================================
-- Fix supplier import column mappings
--
-- Three issues found by /api/debug/sources-probe:
--
-- 1. Arnoia (catalog):   year_edition mapped to "Año de Edición" but the
--    actual CSV header is "Año edicion" → update the mapping.
--
-- 2. Arnoia Stock:       column_mapping contains match_field:"ean" which is
--    a config directive, NOT a CSV column → remove to silence false probe alert.
--    The dedicated Arnoia Stock importer auto-detects columns and ignores
--    column_mapping entirely.
--
-- 3. Libral Argentina:   column_mapping was stored as a nested object
--    {"mappings":{...},"delimiter":"\t"}.  The batch importer expects a flat
--    internalField → csvColumnName mapping.  Also: both "Libral" (API) and
--    "Libral Argentina" (text file) shared source_key "libral", which would
--    mix their stock_by_source entries.  Fix: flatten the mapping, set
--    source_key to "libral_argentina", and store the TAB delimiter in the
--    dedicated `delimiter` column so the batch importer picks it up.
-- ============================================================================

-- Fix 1: Arnoia catalog – correct year_edition CSV column name
UPDATE import_sources
SET column_mapping = jsonb_set(
  column_mapping::jsonb,
  '{year_edition}',
  '"Año edicion"'::jsonb
)
WHERE source_key = 'arnoia'
  AND feed_type   = 'catalog'
  AND column_mapping ? 'year_edition';

-- Fix 2: Arnoia Stock – drop the spurious match_field key
UPDATE import_sources
SET column_mapping = (column_mapping::jsonb - 'match_field')
WHERE (source_key = 'arnoia_stock' OR name ILIKE '%arnoia%stock%')
  AND column_mapping ? 'match_field';

-- Fix 3a: Libral Argentina – assign dedicated source_key
UPDATE import_sources
SET source_key = 'libral_argentina'
WHERE name ILIKE '%libral%argentina%'
  AND feed_type = 'stock_price';

-- Fix 3b: Libral Argentina – flatten column_mapping and set TAB delimiter
UPDATE import_sources
SET
  delimiter      = E'\t',
  column_mapping = '{
    "ean":       "EAN",
    "stock":     "STOCK",
    "title":     "ARTICULO",
    "author":    "AUTORES",
    "brand":     "EDITORIAL",
    "price":     "PRECIO_EUROS",
    "image_url": "URL_FOTOGRAFIA",
    "price_ars": "PESOS_ARGENTINOS"
  }'::jsonb
WHERE name ILIKE '%libral%argentina%'
  AND feed_type = 'stock_price';
