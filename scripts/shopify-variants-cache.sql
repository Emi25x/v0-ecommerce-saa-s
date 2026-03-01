-- Tabla cache de variantes Shopify (se sobreescribe en cada sync)
CREATE TABLE IF NOT EXISTS shopify_variants_cache (
  id                  bigserial PRIMARY KEY,
  store_id            uuid        NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  shopify_product_id  bigint      NOT NULL,
  shopify_variant_id  bigint      NOT NULL,
  shopify_title       text,
  shopify_sku         text,
  shopify_barcode     text,
  shopify_price       numeric,
  shopify_status      text,
  shopify_image_url   text,
  fetched_at          timestamptz DEFAULT now(),
  UNIQUE (store_id, shopify_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_variants_cache_sku
  ON shopify_variants_cache (store_id, shopify_sku)
  WHERE shopify_sku IS NOT NULL AND shopify_sku <> '';

CREATE INDEX IF NOT EXISTS idx_shopify_variants_cache_store
  ON shopify_variants_cache (store_id);

-- Función que hace el matching SQL puro: products.ean = shopify_variants_cache.sku
CREATE OR REPLACE FUNCTION run_shopify_matching(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_matched   int := 0;
  v_upserted  int := 0;
  v_cache_count int := 0;
  v_db_count  int := 0;
BEGIN
  -- Contar datos disponibles
  SELECT COUNT(*) INTO v_cache_count
  FROM shopify_variants_cache
  WHERE store_id = p_store_id AND shopify_sku IS NOT NULL AND shopify_sku <> '';

  SELECT COUNT(*) INTO v_db_count
  FROM products
  WHERE ean IS NOT NULL AND ean <> '';

  -- Upsert por EAN
  INSERT INTO shopify_product_links (
    product_id, store_id,
    shopify_product_id, shopify_variant_id,
    shopify_title, shopify_sku, shopify_barcode,
    shopify_price, shopify_status, shopify_image_url,
    matched_by, matched_value,
    sync_status, last_synced_at, sync_error,
    created_at, updated_at
  )
  SELECT
    p.id,
    p_store_id,
    v.shopify_product_id,
    v.shopify_variant_id,
    v.shopify_title,
    v.shopify_sku,
    v.shopify_barcode,
    v.shopify_price,
    v.shopify_status,
    v.shopify_image_url,
    'ean_vs_sku',
    p.ean,
    'linked',
    now(),
    null,
    now(),
    now()
  FROM products p
  JOIN shopify_variants_cache v
    ON v.shopify_sku = p.ean
   AND v.store_id = p_store_id
  WHERE p.ean IS NOT NULL AND p.ean <> ''
  ON CONFLICT (product_id, store_id, shopify_variant_id)
  DO UPDATE SET
    shopify_title     = EXCLUDED.shopify_title,
    shopify_sku       = EXCLUDED.shopify_sku,
    shopify_barcode   = EXCLUDED.shopify_barcode,
    shopify_price     = EXCLUDED.shopify_price,
    shopify_status    = EXCLUDED.shopify_status,
    shopify_image_url = EXCLUDED.shopify_image_url,
    matched_by        = EXCLUDED.matched_by,
    matched_value     = EXCLUDED.matched_value,
    sync_status       = 'linked',
    last_synced_at    = now(),
    sync_error        = null,
    updated_at        = now();

  GET DIAGNOSTICS v_matched = ROW_COUNT;

  -- Si no matcheó por EAN, intentar por ISBN
  INSERT INTO shopify_product_links (
    product_id, store_id,
    shopify_product_id, shopify_variant_id,
    shopify_title, shopify_sku, shopify_barcode,
    shopify_price, shopify_status, shopify_image_url,
    matched_by, matched_value,
    sync_status, last_synced_at, sync_error,
    created_at, updated_at
  )
  SELECT
    p.id,
    p_store_id,
    v.shopify_product_id,
    v.shopify_variant_id,
    v.shopify_title,
    v.shopify_sku,
    v.shopify_barcode,
    v.shopify_price,
    v.shopify_status,
    v.shopify_image_url,
    'isbn_vs_sku',
    p.isbn,
    'linked',
    now(),
    null,
    now(),
    now()
  FROM products p
  JOIN shopify_variants_cache v
    ON v.shopify_sku = p.isbn
   AND v.store_id = p_store_id
  WHERE p.isbn IS NOT NULL AND p.isbn <> ''
    -- Solo productos que NO matchearon por EAN
    AND NOT EXISTS (
      SELECT 1 FROM shopify_product_links spl
      WHERE spl.product_id = p.id AND spl.store_id = p_store_id
    )
  ON CONFLICT (product_id, store_id, shopify_variant_id)
  DO UPDATE SET
    matched_by        = EXCLUDED.matched_by,
    matched_value     = EXCLUDED.matched_value,
    sync_status       = 'linked',
    last_synced_at    = now(),
    updated_at        = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',           true,
    'cache_count',  v_cache_count,
    'db_count',     v_db_count,
    'matched_ean',  v_matched,
    'matched_isbn', v_upserted,
    'total_linked', v_matched + v_upserted
  );
END;
$$;
