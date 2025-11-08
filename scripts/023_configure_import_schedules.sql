-- Configurar schedules para las importaciones automáticas

-- Primero, obtener los IDs de las fuentes
DO $$
DECLARE
  arnoia_act_id UUID;
  stock_update_id UUID;
BEGIN
  -- Buscar la fuente "Arnoia Act"
  SELECT id INTO arnoia_act_id
  FROM import_sources
  WHERE name ILIKE '%arnoia%act%'
  LIMIT 1;

  -- Buscar la fuente de actualización de stock
  SELECT id INTO stock_update_id
  FROM import_sources
  WHERE name ILIKE '%stock%' OR name ILIKE '%actualiz%'
  LIMIT 1;

  -- Si encontramos Arnoia Act, configurar schedule semanal
  IF arnoia_act_id IS NOT NULL THEN
    -- Eliminar schedule existente si hay
    DELETE FROM import_schedules WHERE source_id = arnoia_act_id;
    
    -- Crear nuevo schedule: Domingos a las 3:00 AM (hora de España)
    INSERT INTO import_schedules (
      id,
      source_id,
      frequency,
      day_of_week,
      hour,
      minute,
      enabled,
      timezone,
      next_run_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      arnoia_act_id,
      'weekly',
      0, -- Domingo
      3, -- 3 AM
      0, -- 0 minutos
      true,
      'Europe/Madrid',
      -- Calcular próximo domingo a las 3 AM
      (DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Madrid') + INTERVAL '3 hours')::TIMESTAMPTZ,
      NOW(),
      NOW()
    );
    
    RAISE NOTICE 'Schedule configurado para Arnoia Act: Domingos a las 3:00 AM';
  ELSE
    RAISE NOTICE 'No se encontró la fuente Arnoia Act';
  END IF;

  -- Si encontramos la fuente de stock, configurar schedule
  IF stock_update_id IS NOT NULL THEN
    -- Eliminar schedule existente si hay
    DELETE FROM import_schedules WHERE source_id = stock_update_id;
    
    -- Crear nuevo schedule: Domingos a las 4:00 AM (1 hora después de Arnoia Act)
    INSERT INTO import_schedules (
      id,
      source_id,
      frequency,
      day_of_week,
      hour,
      minute,
      enabled,
      timezone,
      next_run_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      stock_update_id,
      'weekly',
      0, -- Domingo
      4, -- 4 AM
      0, -- 0 minutos
      true,
      'Europe/Madrid',
      -- Calcular próximo domingo a las 4 AM
      (DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Madrid') + INTERVAL '4 hours')::TIMESTAMPTZ,
      NOW(),
      NOW()
    );
    
    RAISE NOTICE 'Schedule configurado para actualización de stock: Domingos a las 4:00 AM';
  ELSE
    RAISE NOTICE 'No se encontró la fuente de actualización de stock';
  END IF;
END $$;

-- Mostrar los schedules configurados
SELECT 
  s.id,
  src.name AS fuente,
  s.frequency AS frecuencia,
  CASE s.day_of_week
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Lunes'
    WHEN 2 THEN 'Martes'
    WHEN 3 THEN 'Miércoles'
    WHEN 4 THEN 'Jueves'
    WHEN 5 THEN 'Viernes'
    WHEN 6 THEN 'Sábado'
  END AS dia,
  LPAD(s.hour::TEXT, 2, '0') || ':' || LPAD(s.minute::TEXT, 2, '0') AS hora,
  s.timezone,
  s.enabled AS activo,
  s.next_run_at AS proxima_ejecucion,
  s.last_run_at AS ultima_ejecucion
FROM import_schedules s
JOIN import_sources src ON src.id = s.source_id
WHERE s.enabled = true
ORDER BY s.day_of_week, s.hour, s.minute;
