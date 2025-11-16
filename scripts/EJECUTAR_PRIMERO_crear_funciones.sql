-- ============================================
-- EJECUTA ESTE SCRIPT EN SUPABASE SQL EDITOR
-- ============================================
-- Este script crea las funciones necesarias para analizar y eliminar duplicados
-- Ve a: https://supabase.com/dashboard/project/_/sql/new
-- Copia y pega este script completo y haz click en "Run"

-- Agregando índice para acelerar búsquedas por SKU normalizado
CREATE INDEX IF NOT EXISTS idx_products_sku_normalized 
ON products (LOWER(TRIM(sku))) 
WHERE sku IS NOT NULL AND sku != '';

-- Función 1: Analizar duplicados (devuelve conteo detallado) - OPTIMIZADA
CREATE OR REPLACE FUNCTION analyze_duplicate_skus()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  total_products integer;
  duplicate_skus integer;
  total_duplicate_products integer;
  result jsonb;
BEGIN
  -- Contar productos totales
  SELECT COUNT(*) INTO total_products FROM products;
  
  -- Contar SKUs únicos que están duplicados (OPTIMIZADO con índice)
  SELECT COUNT(*) INTO duplicate_skus
  FROM (
    SELECT LOWER(TRIM(sku)) as normalized_sku
    FROM products
    WHERE sku IS NOT NULL AND sku != ''
    GROUP BY LOWER(TRIM(sku))
    HAVING COUNT(*) > 1
  ) t;
  
  -- Calcular productos duplicados SIN ROW_NUMBER (mucho más rápido)
  -- Suma (count - 1) para cada SKU duplicado = total de productos duplicados
  SELECT SUM(sku_count - 1) INTO total_duplicate_products
  FROM (
    SELECT COUNT(*) as sku_count
    FROM products
    WHERE sku IS NOT NULL AND sku != ''
    GROUP BY LOWER(TRIM(sku))
    HAVING COUNT(*) > 1
  ) t;
  
  -- Crear resultado JSON con el nuevo campo totalDuplicateProducts
  result := jsonb_build_object(
    'totalProducts', total_products,
    'totalDuplicateSKUs', duplicate_skus,
    'totalDuplicateProducts', COALESCE(total_duplicate_products, 0),
    'method', 'sql_direct_optimized',
    'note', 'Análisis completo: ' || duplicate_skus || ' SKUs tienen ' || COALESCE(total_duplicate_products, 0) || ' productos duplicados en total'
  );
  
  RETURN result;
END;
$$;

-- Función 2 optimizada: Eliminar duplicados en LOTES para evitar timeout
CREATE OR REPLACE FUNCTION delete_duplicate_products()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer := 0;
  batch_deleted integer := 0;
  total_deleted integer := 0;
  batch_size integer := 500;
  max_iterations integer := 1000;
  iteration_count integer := 0;
BEGIN
  -- Reduciendo tamaño de lote a 500 para evitar timeouts
  LOOP
    -- Eliminar un lote pequeño de duplicados
    WITH duplicates AS (
      SELECT 
        id,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(TRIM(sku)) 
          ORDER BY created_at ASC, id ASC
        ) as rn
      FROM products
      WHERE sku IS NOT NULL AND sku != ''
      LIMIT 2000  -- Analizar solo 2000 productos por iteración
    ),
    to_delete AS (
      SELECT id FROM duplicates WHERE rn > 1 LIMIT batch_size
    )
    DELETE FROM products
    WHERE id IN (SELECT id FROM to_delete);
    
    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    total_deleted := total_deleted + batch_deleted;
    iteration_count := iteration_count + 1;
    
    -- Si no se eliminaron productos en este lote, terminamos
    EXIT WHEN batch_deleted = 0;
    
    -- Aumentado límite a 1000 iteraciones para procesar más productos
    EXIT WHEN iteration_count >= max_iterations;
    
    -- Pausa más corta (0.05s) para procesar más rápido
    PERFORM pg_sleep(0.05);
  END LOOP;
  
  RETURN jsonb_build_object(
    'deletedCount', total_deleted,
    'success', true,
    'iterations', iteration_count,
    'message', total_deleted || ' productos duplicados eliminados en ' || iteration_count || ' lotes (manteniendo el más antiguo de cada SKU)'
  );
END;
$$;

-- Mensaje de confirmación
SELECT 'Funciones optimizadas creadas. Índice agregado para mejor performance.' as status;
