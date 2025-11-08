-- Agregar las dos fuentes de importación iniciales (Arnoia y ArnoiaAct)

-- Insertar fuente Arnoia
INSERT INTO import_sources (
  name,
  type,
  url,
  config,
  created_at,
  updated_at
)
VALUES (
  'Arnoia',
  'catalog',
  'https://elastic-rest.arnoia.com/feeds/getFeeds?customerCode=27401&pass=tale27408&typeFee=catalog',
  jsonb_build_object(
    'columns_mapped', 29,
    'delimiter', ',',
    'encoding', 'utf-8'
  ),
  NOW(),
  NOW()
)
ON CONFLICT (name) DO NOTHING;

-- Insertar fuente Arnoia Act
INSERT INTO import_sources (
  name,
  type,
  url,
  config,
  created_at,
  updated_at
)
VALUES (
  'Arnoia Act',
  'catalog',
  'https://elastic-rest.arnoia.com/feeds/getFeeds?customerCode=27401&pass=tale27408&typeFee=catalog',
  jsonb_build_object(
    'columns_mapped', 29,
    'delimiter', ',',
    'encoding', 'utf-8'
  ),
  NOW(),
  NOW()
)
ON CONFLICT (name) DO NOTHING;

-- Verificar que se insertaron correctamente
SELECT 
  id,
  name,
  type,
  url,
  config->>'columns_mapped' as columns_mapped,
  created_at
FROM import_sources
WHERE name IN ('Arnoia', 'Arnoia Act')
ORDER BY name;
