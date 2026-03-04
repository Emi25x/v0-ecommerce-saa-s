-- Crear import_sources para Azeta (3 feeds: Total, Parcial, Stock)
-- Los schedules se crearán desde la UI o manualmente después

-- 1) Azeta Total (Catálogo general)
INSERT INTO import_sources (
  name,
  feed_type,
  url_template,
  auth_type,
  credentials,
  column_mapping
) VALUES (
  'Azeta Total',
  'catalog',
  'https://www.azetadistribuciones.es/servicios_web/csv.php',
  'query_params',
  '{"type": "query_params", "params": {"user": "valletta", "password": "w7zfbjgg"}}'::jsonb,
  '{
    "delimiter": ";",
    "has_header": true,
    "mappings": {
      "ean": "Ean",
      "isbn": "Isbn",
      "sku": "Codigo",
      "title": "Titulo",
      "author": "Autor",
      "brand": "Editorial",
      "price": "Precio S/IVA",
      "stock": "Ud Venta",
      "pages": "Paginas",
      "width": "Ancho",
      "height": "Alto",
      "weight": "Peso",
      "binding": "Encuadernacion",
      "category": "Tema",
      "language": "Idioma",
      "image_url": "portada",
      "description": "Sinopsis",
      "edition_date": "Fecha edicion"
    }
  }'::jsonb
);

-- 2) Azeta Parcial (Novedades/Actualizaciones)
INSERT INTO import_sources (
  name,
  feed_type,
  url_template,
  auth_type,
  credentials,
  column_mapping
) VALUES (
  'Azeta Parcial',
  'update',
  'https://www.azetadistribuciones.es/servicios_web/csv.php',
  'query_params',
  '{"type": "query_params", "params": {"user": "valletta", "password": "w7zfbjgg"}}'::jsonb,
  '{
    "delimiter": ";",
    "has_header": true,
    "mappings": {
      "ean": "Ean",
      "isbn": "Isbn",
      "sku": "Codigo",
      "title": "Titulo",
      "author": "Autor",
      "brand": "Editorial",
      "price": "Precio S/IVA",
      "stock": "Ud Venta"
    }
  }'::jsonb
);

-- 3) Azeta Stock (Stock diario)
INSERT INTO import_sources (
  name,
  feed_type,
  url_template,
  auth_type,
  credentials,
  column_mapping
) VALUES (
  'Azeta Stock',
  'stock_price',
  'https://www.azetadistribuciones.es/servicios_web/csv.php',
  'query_params',
  '{"type": "query_params", "params": {"user": "valletta", "password": "w7zfbjgg"}}'::jsonb,
  '{
    "delimiter": ";",
    "has_header": true,
    "mappings": {
      "ean": "Ean",
      "isbn": "Isbn",
      "stock": "Ud Venta",
      "price": "Precio S/IVA"
    }
  }'::jsonb
);

SELECT 'Azeta import sources created/updated successfully' AS status;
