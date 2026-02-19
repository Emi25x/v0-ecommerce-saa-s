-- Eliminar fuentes de importación duplicadas manteniendo solo la más reciente

-- 1. Eliminar duplicados de Azeta (mantener el más reciente de cada uno)
WITH ranked_sources AS (
  SELECT 
    id,
    name,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC) as rn
  FROM import_sources
  WHERE name IN ('Azeta Total', 'Azeta Parcial', 'Azeta Stock')
)
DELETE FROM import_sources
WHERE id IN (
  SELECT id FROM ranked_sources WHERE rn > 1
);

-- 2. Eliminar duplicados de cualquier otra fuente (por si acaso)
WITH ranked_all_sources AS (
  SELECT 
    id,
    name,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC) as rn
  FROM import_sources
)
DELETE FROM import_sources
WHERE id IN (
  SELECT id FROM ranked_all_sources WHERE rn > 1
);

-- 3. Mostrar fuentes restantes
SELECT 
  id,
  name,
  feed_type,
  created_at
FROM import_sources
ORDER BY name;
