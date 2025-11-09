-- Consultar los schedules de importación configurados
SELECT 
  s.id,
  src.name as source_name,
  s.frequency,
  s.hour,
  s.minute,
  s.day_of_week,
  s.day_of_month,
  s.enabled,
  s.last_run_at,
  s.next_run_at
FROM import_schedules s
JOIN import_sources src ON s.source_id = src.id
ORDER BY s.next_run_at;
