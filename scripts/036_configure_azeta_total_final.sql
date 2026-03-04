-- Configuración FINAL y correcta para Azeta Total
-- Este script se puede ejecutar múltiples veces (idempotente)

-- Eliminar source antiguo si existe
DELETE FROM import_sources WHERE name = 'Azeta Total';

-- Crear Azeta Total con configuración correcta
INSERT INTO import_sources (
  name,
  feed_type,
  url_template,
  auth_type,
  credentials,
  column_mapping,
  is_active
) VALUES (
  'Azeta Total',
  'catalog',
  'https://www.azetadistribuciones.es/servicios_web/azeta_catalogo_notexto_csv.csv.zip',
  'query_params',
  '{"type": "query_params", "params": {"user": "680899", "password": "badajoz24"}}'::jsonb,
  '{
    "delimiter": "|",
    "mode": "upsert",
    "fields": {
      "ean": "Ean",
      "isbn": "Isbn",
      "title": "Titulo",
      "author": "Autor",
      "publisher": "Editorial",
      "price": "Pvp",
      "stock": "Stock",
      "binding": "Encuadernacion",
      "language": "Idioma",
      "pages": "Paginas",
      "year_edition": "Fecha Edicion",
      "subject": "Materia"
    }
  }'::jsonb,
  true
);

-- Verificar que se creó correctamente
SELECT 
  name,
  url_template,
  auth_type,
  credentials->'params'->>'user' as username,
  column_mapping->>'delimiter' as delimiter,
  column_mapping->>'mode' as mode,
  is_active
FROM import_sources 
WHERE name = 'Azeta Total';
