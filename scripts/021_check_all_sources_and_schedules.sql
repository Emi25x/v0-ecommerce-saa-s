-- Consultar todas las fuentes de importación y sus schedules configurados

-- 1. Ver todas las fuentes configuradas
SELECT 
  id,
  name,
  feed_type,
  is_active,
  last_import_at,
  created_at,
  url_template,
  column_mapping
FROM import_sources
ORDER BY name;

-- 2. Ver todos los schedules configurados
SELECT 
  s.id,
  src.name AS source_name,
  s.enabled,
  s.frequency,
  s.hour,
  s.minute,
  s.day_of_week,
  s.day_of_month,
  s.timezone,
  s.cron_expression,
  s.last_run_at,
  s.next_run_at
FROM import_schedules s
JOIN import_sources src ON s.source_id = src.id
ORDER BY src.name, s.frequency;

-- 3. Ver el historial de importaciones reciente
SELECT 
  h.id,
  src.name AS source_name,
  h.status,
  h.products_imported,
  h.products_updated,
  h.products_failed,
  h.started_at,
  h.completed_at,
  h.error_message
FROM import_history h
JOIN import_sources src ON h.source_id = src.id
ORDER BY h.started_at DESC
LIMIT 20;

-- 4. Resumen de productos por fuente
SELECT 
  unnest(source) AS source_name,
  COUNT(*) AS product_count
FROM products
GROUP BY source_name
ORDER BY product_count DESC;
