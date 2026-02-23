-- Fix: Configurar delimiter PIPE para Azeta Total en la base de datos
-- Este script actualiza el campo "delimiter" que es leído por /api/inventory/import/batch

UPDATE import_sources
SET 
  delimiter = '|',
  updated_at = now()
WHERE name ILIKE '%azeta%total%' OR name ILIKE '%azeta%catalogo%';

-- Verificación
SELECT 
  id,
  name,
  delimiter,
  url_template
FROM import_sources
WHERE name ILIKE '%azeta%'
ORDER BY name;
