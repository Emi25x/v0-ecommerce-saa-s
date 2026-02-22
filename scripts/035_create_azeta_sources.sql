-- Crear 3 fuentes de importación para AZETA con delimiters correctos

-- 1. AZETA Total (Catálogo completo) - Domingos 3 AM
INSERT INTO import_sources (
  name,
  url_template,
  enabled,
  schedule,
  column_mapping
) VALUES (
  'Azeta Total',
  'https://www.azeta.com.ar/azeta_catalogo_notexto_csv.csv',
  true,
  '0 3 * * 0',  -- Domingos 3 AM
  jsonb_build_object(
    'delimiter', '|',
    'has_header', true,
    'mode', 'upsert',
    'source_key', 'azeta'
  )
)
ON CONFLICT (name) DO UPDATE SET
  url_template = EXCLUDED.url_template,
  schedule = EXCLUDED.schedule,
  column_mapping = EXCLUDED.column_mapping;

-- 2. AZETA Parcial (Updates) - Cada 6 horas
INSERT INTO import_sources (
  name,
  url_template,
  enabled,
  schedule,
  column_mapping
) VALUES (
  'Azeta Parcial',
  'https://www.azeta.com.ar/azeta_catalogo_parcial_notexto_csv.csv',
  true,
  '0 */6 * * *',  -- Cada 6 horas
  jsonb_build_object(
    'delimiter', '|',
    'has_header', true,
    'mode', 'upsert',
    'source_key', 'azeta'
  )
)
ON CONFLICT (name) DO UPDATE SET
  url_template = EXCLUDED.url_template,
  schedule = EXCLUDED.schedule,
  column_mapping = EXCLUDED.column_mapping;

-- 3. AZETA Stock (Solo stock) - Cada 4 horas
INSERT INTO import_sources (
  name,
  url_template,
  enabled,
  schedule,
  column_mapping
) VALUES (
  'Azeta Stock',
  'https://www.azeta.com.ar/stock.csv',
  true,
  '0 */4 * * *',  -- Cada 4 horas
  jsonb_build_object(
    'delimiter', ';',
    'has_header', false,
    'mode', 'stock_only',
    'source_key', 'azeta'
  )
)
ON CONFLICT (name) DO UPDATE SET
  url_template = EXCLUDED.url_template,
  schedule = EXCLUDED.schedule,
  column_mapping = EXCLUDED.column_mapping;

-- Verificar que se crearon correctamente
SELECT 
  id,
  name,
  url_template,
  enabled,
  schedule,
  column_mapping->>'delimiter' as delimiter,
  column_mapping->>'mode' as mode
FROM import_sources 
WHERE name LIKE 'Azeta%'
ORDER BY name;
