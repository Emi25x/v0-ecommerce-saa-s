-- Función para eliminar productos duplicados (versión optimizada)
CREATE OR REPLACE FUNCTION delete_duplicate_products()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  -- Eliminar duplicados manteniendo el producto más antiguo de cada SKU
  WITH duplicates_to_delete AS (
    SELECT id
    FROM (
      SELECT 
        id,
        ROW_NUMBER() OVER (
          PARTITION BY UPPER(TRIM(sku)) 
          ORDER BY created_at ASC
        ) as row_num
      FROM products
      WHERE sku IS NOT NULL AND sku != ''
    ) ranked
    WHERE row_num > 1
  )
  DELETE FROM products
  WHERE id IN (SELECT id FROM duplicates_to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Otorgar permisos
GRANT EXECUTE ON FUNCTION delete_duplicate_products() TO authenticated, anon, service_role;
