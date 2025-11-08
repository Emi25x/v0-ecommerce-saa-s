-- ========================================
-- PASO 1: DIAGNÓSTICO
-- ========================================
-- Ver el estado actual de las fuentes de importación
SELECT 
  id,
  name,
  type,
  url,
  is_active,
  last_import_at,
  created_at
FROM import_sources
WHERE name LIKE '%Arnoia%' OR name LIKE '%Libral%'
ORDER BY name;

-- Ver los schedules actuales
SELECT 
  id,
  source_id,
  frequency,
  time_of_day,
  timezone,
  is_active,
  next_run_at,
  last_run_at,
  created_at
FROM import_schedules
WHERE source_id IN (
  SELECT id FROM import_sources 
  WHERE name LIKE '%Arnoia%' OR name LIKE '%Libral%'
);

-- Ver importaciones atascadas en "running"
SELECT 
  id,
  source_id,
  status,
  started_at,
  completed_at,
  products_imported,
  products_updated,
  created_at
FROM import_history
WHERE status = 'running'
AND started_at < NOW() - INTERVAL '2 hours'
ORDER BY started_at DESC;

-- ========================================
-- PASO 2: LIMPIAR IMPORTACIONES ATASCADAS
-- ========================================
-- Cancelar importaciones que llevan más de 2 horas en "running"
UPDATE import_history
SET 
  status = 'cancelled',
  completed_at = NOW(),
  error_message = 'Cancelled automatically - stuck in running state for more than 2 hours'
WHERE status = 'running'
AND started_at < NOW() - INTERVAL '2 hours';

-- ========================================
-- PASO 3: REACTIVAR CRONJOBS
-- ========================================
-- Reactivar todos los schedules de Arnoia y Libral
UPDATE import_schedules
SET 
  is_active = true,
  next_run_at = CASE
    WHEN frequency = 'daily' THEN 
      (CURRENT_DATE + INTERVAL '1 day' + time_of_day::time)::timestamptz AT TIME ZONE timezone
    WHEN frequency = 'weekly' THEN
      (CURRENT_DATE + INTERVAL '1 week' + time_of_day::time)::timestamptz AT TIME ZONE timezone
    WHEN frequency = 'hourly' THEN
      NOW() + INTERVAL '1 hour'
    ELSE
      NOW() + INTERVAL '1 day'
  END
WHERE source_id IN (
  SELECT id FROM import_sources 
  WHERE name LIKE '%Arnoia%' OR name LIKE '%Libral%'
);

-- Verificar que se actualizaron correctamente
SELECT 
  s.name as source_name,
  sch.frequency,
  sch.time_of_day,
  sch.is_active,
  sch.next_run_at,
  sch.last_run_at
FROM import_schedules sch
JOIN import_sources s ON s.id = sch.source_id
WHERE s.name LIKE '%Arnoia%' OR s.name LIKE '%Libral%'
ORDER BY s.name;
