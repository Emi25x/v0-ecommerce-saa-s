-- Matching directo: products.ean = shopify_variants_cache.shopify_sku
-- Tienda: 842c25a1-e1e3-446b-ac17-ea726f20a219

DO $$
DECLARE
  v_store_id uuid := '842c25a1-e1e3-446b-ac17-ea726f20a219';
  v_matched_ean int;
  v_matched_isbn int;
BEGIN

  -- Match 1: EAN de products = SKU de Shopify
  INSERT INTO shopify_product_links (
    product_id, store_id,
    shopify_product_id, shopify_variant_id,
    shopify_title, shopify_sku, shopify_barcode,
    shopify_price, shopify_status, shopify_image_url,
    matched_by, matched_value,
    sync_status, last_synced_at, sync_error
  )
  SELECT
    p.id,
    v_store_id,
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
    NOW(),
    NULL
  FROM products p
  JOIN shopify_variants_cache v
    ON v.store_id = v_store_id
    AND TRIM(p.ean) = TRIM(v.shopify_sku)
  WHERE p.ean IS NOT NULL AND p.ean <> ''
  ON CONFLICT (product_id, store_id, shopify_variant_id)
  DO UPDATE SET
    shopify_title     = EXCLUDED.shopify_title,
    shopify_sku       = EXCLUDED.shopify_sku,
    shopify_price     = EXCLUDED.shopify_price,
    shopify_status    = EXCLUDED.shopify_status,
    shopify_image_url = EXCLUDED.shopify_image_url,
    matched_by        = 'ean_vs_sku',
    matched_value     = EXCLUDED.matched_value,
    sync_status       = 'linked',
    last_synced_at    = NOW(),
    sync_error        = NULL;

  GET DIAGNOSTICS v_matched_ean = ROW_COUNT;

  -- Match 2: ISBN de products = SKU de Shopify (solo los que no matchearon por EAN)
  INSERT INTO shopify_product_links (
    product_id, store_id,
    shopify_product_id, shopify_variant_id,
    shopify_title, shopify_sku, shopify_barcode,
    shopify_price, shopify_status, shopify_image_url,
    matched_by, matched_value,
    sync_status, last_synced_at, sync_error
  )
  SELECT
    p.id,
    v_store_id,
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
    NOW(),
    NULL
  FROM products p
  JOIN shopify_variants_cache v
    ON v.store_id = v_store_id
    AND TRIM(p.isbn) = TRIM(v.shopify_sku)
  WHERE p.isbn IS NOT NULL AND p.isbn <> ''
    AND NOT EXISTS (
      SELECT 1 FROM shopify_product_links spl
      WHERE spl.product_id = p.id AND spl.store_id = v_store_id
    )
  ON CONFLICT (product_id, store_id, shopify_variant_id)
  DO NOTHING;

  GET DIAGNOSTICS v_matched_isbn = ROW_COUNT;

  RAISE NOTICE 'Matching completado: % por EAN, % por ISBN. Total: %',
    v_matched_ean, v_matched_isbn, v_matched_ean + v_matched_isbn;

END $$;
