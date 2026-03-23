-- ============================================================
-- Verificación del pipeline de stock multi-source
-- Ejecutar contra Supabase para confirmar que todo está en orden
-- ============================================================

-- 1. Verificar columnas en products
SELECT 'products.stock_by_source' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'products' AND column_name = 'stock_by_source'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

SELECT 'products.stock' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'products' AND column_name = 'stock'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

-- 2. Verificar columnas en integration_configs
SELECT 'integration_configs.token' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'integration_configs' AND column_name = 'token'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

SELECT 'integration_configs.token_expires_at' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'integration_configs' AND column_name = 'token_expires_at'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

-- 3. Verificar funciones RPC
SELECT 'bulk_update_stock_price' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public' AND p.proname = 'bulk_update_stock_price'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

SELECT 'bulk_update_azeta_stock' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public' AND p.proname = 'bulk_update_azeta_stock'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

SELECT 'zero_source_stock_not_in_list' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public' AND p.proname = 'zero_source_stock_not_in_list'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

SELECT 'zero_azeta_stock_not_in_list' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public' AND p.proname = 'zero_azeta_stock_not_in_list'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

SELECT 'bulk_update_stock_two_prices' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public' AND p.proname = 'bulk_update_stock_two_prices'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

SELECT 'calculate_stock_total' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public' AND p.proname = 'calculate_stock_total'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

SELECT 'sync_stock_total' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public' AND p.proname = 'sync_stock_total'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

-- 4. Verificar trigger
SELECT 'trigger_sync_stock_total' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger t
         JOIN pg_class c ON t.tgrelid = c.oid
         WHERE c.relname = 'products' AND t.tgname = 'trigger_sync_stock_total'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

-- 5. Verificar source_key en import_sources
SELECT 'import_sources.source_key' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'import_sources' AND column_name = 'source_key'
       ) THEN 'OK' ELSE 'MISSING' END AS status;

-- 6. Verificar firma de bulk_update_stock_price (debe tener p_source_key)
SELECT 'bulk_update_stock_price(4 args with source_key)' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = 'public'
           AND p.proname = 'bulk_update_stock_price'
           AND p.pronargs >= 4
       ) THEN 'OK' ELSE 'MISSING (solo 3 args, falta p_source_key)' END AS status;

-- 7. Resumen de stock_by_source por fuente
SELECT 'Stock sources in use' AS info,
       jsonb_object_keys AS source,
       count(*) AS product_count
FROM products, jsonb_object_keys(stock_by_source)
GROUP BY jsonb_object_keys
ORDER BY product_count DESC;

-- 8. Verificar GIN index en stock_by_source
SELECT 'idx_products_stock_by_source (GIN)' AS check_item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'products' AND indexname = 'idx_products_stock_by_source'
       ) THEN 'OK' ELSE 'MISSING' END AS status;
