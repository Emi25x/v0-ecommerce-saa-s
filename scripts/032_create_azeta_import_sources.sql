-- Crear import_sources para Azeta (3 feeds: Total, Parcial, Stock)
-- Esto permite que Azeta use el MISMO motor que Arnoia

-- 1) Azeta Total (Catálogo general) - Día 1 de meses impares
INSERT INTO import_sources (
  name,
  feed_type,
  url_template,
  auth_type,
  credentials,
  column_mapping,
  created_at,
  updated_at
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
) ON CONFLICT DO NOTHING;

-- 2) Azeta Parcial (Novedades/Actualizaciones) - Lunes semanalmente
INSERT INTO import_sources (
  name,
  feed_type,
  url_template,
  auth_type,
  credentials,
  column_mapping,
  created_at,
  updated_at
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
) ON CONFLICT DO NOTHING;

-- 3) Azeta Stock (Stock diario)
INSERT INTO import_sources (
  name,
  feed_type,
  url_template,
  auth_type,
  credentials,
  column_mapping,
  created_at,
  updated_at
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
) ON CONFLICT DO NOTHING;

-- 4) Crear schedules para Azeta
-- Azeta Total: Día 1 de meses impares a las 3:00 AM
INSERT INTO import_schedules (
  source_id,
  frequency,
  day_of_month,
  hour,
  enabled,
  next_run_at
) 
SELECT 
  id,
  'monthly',
  1,  -- Día 1
  3,  -- 3 AM
  true,
  CASE 
    WHEN EXTRACT(MONTH FROM NOW()) % 2 = 1 THEN -- Si estamos en mes impar
      CASE 
        WHEN EXTRACT(DAY FROM NOW()) >= 1 THEN -- Si ya pasó el día 1
          DATE_TRUNC('month', NOW() + INTERVAL '2 months') + INTERVAL '1 day' + INTERVAL '3 hours'
        ELSE
          DATE_TRUNC('month', NOW()) + INTERVAL '1 day' + INTERVAL '3 hours'
      END
    ELSE -- Si estamos en mes par, próxima ejecución es el mes impar siguiente
      DATE_TRUNC('month', NOW() + INTERVAL '1 month') + INTERVAL '1 day' + INTERVAL '3 hours'
  END
FROM import_sources WHERE name = 'Azeta Total'
ON CONFLICT DO NOTHING;

-- Azeta Parcial: Lunes semanalmente a las 2:00 AM
INSERT INTO import_schedules (
  source_id,
  frequency,
  day_of_week,
  hour,
  enabled,
  next_run_at
)
SELECT 
  id,
  'weekly',
  1,  -- Lunes
  2,  -- 2 AM
  true,
  CASE 
    WHEN EXTRACT(DOW FROM NOW()) = 1 AND EXTRACT(HOUR FROM NOW()) < 2 THEN -- Si es lunes antes de las 2 AM
      DATE_TRUNC('day', NOW()) + INTERVAL '2 hours'
    ELSE -- Próximo lunes
      DATE_TRUNC('day', NOW() + INTERVAL '1 day' * ((8 - EXTRACT(DOW FROM NOW())::int) % 7)) + INTERVAL '2 hours'
  END
FROM import_sources WHERE name = 'Azeta Parcial'
ON CONFLICT DO NOTHING;

-- Azeta Stock: Diariamente a las 1:00 AM
INSERT INTO import_schedules (
  source_id,
  frequency,
  hour,
  enabled,
  next_run_at
)
SELECT 
  id,
  'daily',
  1,  -- 1 AM
  true,
  CASE 
    WHEN EXTRACT(HOUR FROM NOW()) < 1 THEN -- Si aún no son la 1 AM hoy
      DATE_TRUNC('day', NOW()) + INTERVAL '1 hour'
    ELSE -- Mañana a la 1 AM
      DATE_TRUNC('day', NOW() + INTERVAL '1 day') + INTERVAL '1 hour'
  END
FROM import_sources WHERE name = 'Azeta Stock'
ON CONFLICT DO NOTHING;
