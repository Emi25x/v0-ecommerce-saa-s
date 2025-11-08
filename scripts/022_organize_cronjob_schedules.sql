-- Organizar los horarios de los cronjobs para que se ejecuten en el orden correcto
-- 
-- Estrategia:
-- 1. "Arnoia Act" - Actualización semanal (domingos a las 2:00 AM)
-- 2. "Actualización de precio y stock" - Después de Arnoia Act (domingos a las 3:00 AM)
-- 3. Cualquier otra actualización diaria puede ejecutarse en horarios diferentes

-- Primero, ver qué fuentes tenemos
SELECT 
  id,
  name,
  feed_type,
  is_active
FROM import_sources
ORDER BY name;

-- Actualizar el schedule de "Arnoia Act" para que se ejecute semanalmente los domingos a las 2:00 AM
UPDATE import_schedules
SET 
  enabled = true,
  frequency = 'weekly',
  hour = 2,
  minute = 0,
  day_of_week = 0, -- 0 = domingo
  timezone = 'America/Argentina/Buenos_Aires',
  cron_expression = '0 2 * * 0', -- Domingos a las 2:00 AM
  next_run_at = (
    -- Calcular el próximo domingo a las 2:00 AM
    date_trunc('week', NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires') + INTERVAL '2 hours'
  )
WHERE source_id = (
  SELECT id FROM import_sources WHERE name ILIKE '%arnoia act%' LIMIT 1
);

-- Actualizar el schedule de "Actualización de precio y stock" para que se ejecute después
UPDATE import_schedules
SET 
  enabled = true,
  frequency = 'weekly',
  hour = 3,
  minute = 0,
  day_of_week = 0, -- 0 = domingo
  timezone = 'America/Argentina/Buenos_Aires',
  cron_expression = '0 3 * * 0', -- Domingos a las 3:00 AM
  next_run_at = (
    -- Calcular el próximo domingo a las 3:00 AM
    date_trunc('week', NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires') + INTERVAL '3 hours'
  )
WHERE source_id = (
  SELECT id FROM import_sources WHERE name ILIKE '%actualizaci%precio%stock%' OR name ILIKE '%precio%stock%' LIMIT 1
);

-- Verificar los schedules actualizados
SELECT 
  s.id,
  src.name AS source_name,
  s.enabled,
  s.frequency,
  s.hour,
  s.minute,
  s.day_of_week,
  s.timezone,
  s.cron_expression,
  s.next_run_at,
  s.last_run_at
FROM import_schedules s
JOIN import_sources src ON s.source_id = src.id
ORDER BY s.day_of_week, s.hour, s.minute;
