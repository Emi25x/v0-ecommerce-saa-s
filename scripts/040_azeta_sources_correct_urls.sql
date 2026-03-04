-- Configurar las 3 fuentes de AZETA con las URLs CORRECTAS de la documentación
-- Catálogo Total, Parcial y Stock

-- Eliminar fuentes existentes de AZETA para evitar duplicados
DELETE FROM import_sources WHERE name ILIKE '%azeta%';

-- 1. AZETA TOTAL (Catálogo completo - se genera día 1 de meses impares)
INSERT INTO import_sources (
  name,
  url_template,
  is_active,
  delimiter,
  credentials,
  column_mapping
) VALUES (
  'Azeta Total',
  'https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24',
  true,
  '|', -- Delimiter PIPE
  '{}'::jsonb,
  jsonb_build_object(
    'ean', 'Ean',
    'title', 'Titulo',
    'author', 'Autor',
    'publisher', 'Editorial',
    'price', 'Precio',
    'isbn', 'Isbn',
    'publication_date', 'Fecha de Edicion',
    'language', 'Idioma',
    'binding', 'Encuadernacion',
    'pages', 'Num Pag',
    'weight', 'Peso',
    'width', 'Ancho',
    'height', 'Alto'
  )
);

-- 2. AZETA PARCIAL (Novedades semanales - se genera lunes de madrugada)
INSERT INTO import_sources (
  name,
  url_template,
  is_active,
  delimiter,
  credentials,
  column_mapping
) VALUES (
  'Azeta Parcial',
  'https://www.azetadistribuciones.es/servicios_web/csv_parcial.php?user=680899&password=badajoz24',
  true,
  '|', -- Delimiter PIPE
  '{}'::jsonb,
  jsonb_build_object(
    'ean', 'Ean',
    'title', 'Titulo',
    'author', 'Autor',
    'publisher', 'Editorial',
    'price', 'Precio',
    'isbn', 'Isbn',
    'publication_date', 'Fecha de Edicion',
    'language', 'Idioma',
    'binding', 'Encuadernacion',
    'pages', 'Num Pag',
    'weight', 'Peso',
    'width', 'Ancho',
    'height', 'Alto'
  )
);

-- 3. AZETA STOCK (Stock diario)
INSERT INTO import_sources (
  name,
  url_template,
  is_active,
  delimiter,
  credentials,
  column_mapping
) VALUES (
  'Azeta Stock',
  'http://www.azetadistribuciones.es/servicios_web/stock.php?fr_usuario=680899&fr_clave=badajoz24',
  true,
  ';', -- Delimiter SEMICOLON
  '{}'::jsonb,
  jsonb_build_object(
    'ean', 'EAN',
    'stock', 'Stock'
  )
);

-- Verificar configuración
SELECT 
  name, 
  url_template,
  delimiter,
  is_active
FROM import_sources 
WHERE name ILIKE '%azeta%'
ORDER BY name;
