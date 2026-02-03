-- ============================================================================
-- SCRIPT DEFINITIVO PARA ELIMINAR PRODUCTOS DUPLICADOS
-- ============================================================================
-- INSTRUCCIONES:
-- 1. Ve a: https://supabase.com/dashboard (selecciona tu proyecto)
-- 2. Click "SQL Editor" en el menú lateral
-- 3. Click "New Query"
-- 4. Copia y pega TODO este script
-- 5. Click "Run"
-- ============================================================================

-- PASO 1: Ver cuántos duplicados hay
SELECT 
    '=== ANÁLISIS DE DUPLICADOS ===' as info,
    COUNT(*) as total_productos,
    (SELECT COUNT(*) FROM (
        SELECT LOWER(TRIM(sku)) as sku_norm
        FROM products
        WHERE sku IS NOT NULL AND sku != ''
        GROUP BY LOWER(TRIM(sku))
        HAVING COUNT(*) > 1
    ) t) as skus_duplicados,
    (SELECT SUM(count - 1) FROM (
        SELECT COUNT(*) as count
        FROM products
        WHERE sku IS NOT NULL AND sku != ''
        GROUP BY LOWER(TRIM(sku))
        HAVING COUNT(*) > 1
    ) t) as productos_a_eliminar;

-- PASO 2: Ver ejemplos de duplicados (primeros 10)
SELECT 
    LOWER(TRIM(sku)) as sku_normalizado,
    COUNT(*) as cantidad_duplicados,
    array_agg(id ORDER BY created_at ASC) as ids_productos,
    MIN(created_at) as mas_antiguo,
    MAX(created_at) as mas_reciente
FROM products
WHERE sku IS NOT NULL AND sku != ''
GROUP BY LOWER(TRIM(sku))
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 10;

-- PASO 3: ELIMINAR DUPLICADOS (mantiene el más antiguo)
-- ADVERTENCIA: Esta operación NO se puede deshacer
-- Descomenta las líneas de abajo para ejecutar la eliminación

/*
WITH duplicates AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(sku)) 
            ORDER BY created_at ASC, id ASC
        ) as rn
    FROM products
    WHERE sku IS NOT NULL AND sku != ''
)
DELETE FROM products
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- Ver resultado
SELECT 'Duplicados eliminados exitosamente' as status;
*/

-- PASO 4: Verificar que se eliminaron
-- (Ejecuta esto después de eliminar)
/*
SELECT 
    '=== VERIFICACIÓN POST-ELIMINACIÓN ===' as info,
    COUNT(*) as total_productos_restantes,
    (SELECT COUNT(*) FROM (
        SELECT LOWER(TRIM(sku)) as sku_norm
        FROM products
        WHERE sku IS NOT NULL AND sku != ''
        GROUP BY LOWER(TRIM(sku))
        HAVING COUNT(*) > 1
    ) t) as skus_duplicados_restantes;
*/
