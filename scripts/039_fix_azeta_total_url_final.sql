-- Fix URL de AZETA Total con la URL correcta del archivo ZIP
-- La URL debe apuntar al archivo ZIP que contiene el CSV

UPDATE import_sources
SET 
  url_template = 'https://www.azetadistribuciones.es/servicios_web/azeta_catalogo_notexto_csv.csv.zip?user=680899&password=badajoz24',
  delimiter = '|',
  updated_at = NOW()
WHERE name = 'Azeta Total';

-- Verificar el cambio
SELECT 
  name,
  url_template,
  delimiter,
  feed_type
FROM import_sources
WHERE name = 'Azeta Total';
