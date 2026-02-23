-- Actualizar URLs de AZETA con las URLs correctas proporcionadas por el proveedor
-- Los archivos son CSV directos (NO ZIP)

-- 1. AZETA Total (catálogo completo) - generado día 1 de meses impares
UPDATE import_sources
SET 
  url_template = 'https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24',
  delimiter = '|',
  name = 'Azeta Total',
  updated_at = NOW()
WHERE name ILIKE '%azeta%total%';

-- 2. AZETA Parcial (actualizaciones semanales) - generado todos los lunes
UPDATE import_sources
SET 
  url_template = 'https://www.azetadistribuciones.es/servicios_web/csv_parcial.php?user=680899&password=badajoz24',
  delimiter = '|',
  name = 'Azeta Parcial',
  updated_at = NOW()
WHERE name ILIKE '%azeta%parcial%';

-- 3. AZETA Stock (disponibilidad) - actualizado frecuentemente
UPDATE import_sources
SET 
  url_template = 'http://www.azetadistribuciones.es/servicios_web/stock.php?fr_usuario=680899&fr_clave=badajoz24',
  delimiter = ';',
  name = 'Azeta Stock',
  updated_at = NOW()
WHERE name ILIKE '%azeta%stock%';

-- Verificar URLs actualizadas
SELECT 
  id,
  name,
  url_template,
  delimiter
FROM import_sources
WHERE name ILIKE '%azeta%'
ORDER BY name;
