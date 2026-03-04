-- Actualizar credenciales correctas para Azeta Total, Parcial y Stock
-- Usuario: 680899
-- Password: badajoz24

UPDATE import_sources
SET credentials = '{"type": "query_params", "params": {"user": "680899", "password": "badajoz24"}}'::jsonb
WHERE name IN ('Azeta Total', 'Azeta Parcial', 'Azeta Stock');

SELECT name, auth_type, credentials 
FROM import_sources 
WHERE name LIKE 'Azeta%';
