-- Corregir delimiter de ARNOIA a PIPE (|) en todas las fuentes
-- ARNOIA usa pipe como delimiter en todos sus archivos CSV

UPDATE import_sources 
SET delimiter = '|'
WHERE name ILIKE '%arnoia%';

-- Verificar cambios
SELECT name, delimiter, url_template
FROM import_sources 
WHERE name ILIKE '%arnoia%'
ORDER BY name;
