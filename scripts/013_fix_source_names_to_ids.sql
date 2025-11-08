-- Migración: Convertir nombres de fuentes a IDs en el campo source
-- Este script actualiza todos los productos que tienen nombres de fuentes
-- en el campo source para que tengan los IDs correspondientes

DO $$
DECLARE
  source_record RECORD;
  updated_count INTEGER := 0;
BEGIN
  -- Para cada fuente de importación
  FOR source_record IN 
    SELECT id, name FROM import_sources
  LOOP
    -- Actualizar productos que tienen el nombre de esta fuente
    -- Convertir el nombre a ID en el array source
    UPDATE products
    SET source = ARRAY[source_record.id::text]
    WHERE source @> ARRAY[source_record.name]
      AND NOT (source @> ARRAY[source_record.id::text]);
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    IF updated_count > 0 THEN
      RAISE NOTICE 'Actualizados % productos con fuente "%" a ID "%"', 
        updated_count, source_record.name, source_record.id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migración completada';
END $$;

-- Verificar resultados
SELECT 
  'Productos con IDs de fuentes' as tipo,
  COUNT(*) as cantidad
FROM products
WHERE EXISTS (
  SELECT 1 FROM import_sources 
  WHERE products.source @> ARRAY[id::text]
)
UNION ALL
SELECT 
  'Productos con nombres de fuentes' as tipo,
  COUNT(*) as cantidad
FROM products
WHERE EXISTS (
  SELECT 1 FROM import_sources 
  WHERE products.source @> ARRAY[name]
);
