-- Script para importar el segundo CSV de publicaciones
-- Este CSV tiene ~8,400 publicaciones de otra cuenta de ML
-- Formato: ITEM_ID en columna 2, SKU en columna 5, TITLE en columna 6

-- Obtener account_id (primera cuenta disponible)
DO $$
DECLARE
  v_account_id uuid;
BEGIN
  SELECT id INTO v_account_id FROM ml_accounts LIMIT 1;
  
  RAISE NOTICE 'Procesando CSV2 para cuenta: %', v_account_id;
END $$;
