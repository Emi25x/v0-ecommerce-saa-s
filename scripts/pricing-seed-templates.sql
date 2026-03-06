-- Seed default pricing templates for ML Argentina
-- Safe to re-run: uses INSERT ... WHERE NOT EXISTS

-- Template 1: ML Argentina — Libros (category with fixed fee + free shipping)
WITH ins AS (
  INSERT INTO price_lists (name, channel, country_code, currency, pricing_base, description, is_active)
  SELECT 'ML ARG — Libros', 'ml', 'AR', 'ARS', 'cost',
         'Template para libros en ML Argentina. Fee fijo 16.5%, envío gratis incluido, sin IVA sobre fee.', false
  WHERE NOT EXISTS (
    SELECT 1 FROM price_lists WHERE name = 'ML ARG — Libros' AND channel = 'ml'
  )
  RETURNING id
)
INSERT INTO price_list_fee_rules (price_list_id, fee_type, fee_percent, fee_label, sort_order, is_active)
SELECT id, 'percent', 16.5, 'Fee ML Libros', 1, true FROM ins
ON CONFLICT DO NOTHING;

WITH ins2 AS (
  SELECT id FROM price_lists WHERE name = 'ML ARG — Libros' AND channel = 'ml' LIMIT 1
)
INSERT INTO price_list_rules (price_list_id, markup_default, margin_min, round_to)
SELECT id, 40, 15, 100 FROM ins2
WHERE NOT EXISTS (
  SELECT 1 FROM price_list_rules pr
  JOIN ins2 ON pr.price_list_id = ins2.id
);

WITH ins2 AS (
  SELECT id FROM price_lists WHERE name = 'ML ARG — Libros' AND channel = 'ml' LIMIT 1
)
INSERT INTO price_list_ml_rules (
  price_list_id, listing_type, free_shipping_strategy,
  ml_fee_percent, apply_iva_on_fee,
  min_price, max_price
)
SELECT id, 'gold_special', 'included_in_price',
       16.5, false,
       500, null
FROM ins2
WHERE NOT EXISTS (
  SELECT 1 FROM price_list_ml_rules mlr
  JOIN ins2 ON mlr.price_list_id = ins2.id
);

-- Template 2: ML ARG — Clásico (standard listing, free shipping threshold)
WITH ins AS (
  INSERT INTO price_lists (name, channel, country_code, currency, pricing_base, description, is_active)
  SELECT 'ML ARG — Clásico', 'ml', 'AR', 'ARS', 'cost',
         'Template estándar para ML Argentina. Fee 12% + IVA, envío gratis por encima de threshold.', false
  WHERE NOT EXISTS (
    SELECT 1 FROM price_lists WHERE name = 'ML ARG — Clásico' AND channel = 'ml'
  )
  RETURNING id
)
INSERT INTO price_list_fee_rules (price_list_id, fee_type, fee_percent, fee_label, sort_order, is_active)
SELECT id, 'percent', 12, 'Fee ML Clásico', 1, true FROM ins
ON CONFLICT DO NOTHING;

WITH ins2 AS (
  SELECT id FROM price_lists WHERE name = 'ML ARG — Clásico' AND channel = 'ml' LIMIT 1
)
INSERT INTO price_list_rules (price_list_id, markup_default, margin_min, round_to)
SELECT id, 45, 18, 100 FROM ins2
WHERE NOT EXISTS (
  SELECT 1 FROM price_list_rules pr
  JOIN ins2 ON pr.price_list_id = ins2.id
);

WITH ins2 AS (
  SELECT id FROM price_lists WHERE name = 'ML ARG — Clásico' AND channel = 'ml' LIMIT 1
)
INSERT INTO price_list_ml_rules (
  price_list_id, listing_type, free_shipping_strategy,
  ml_fee_percent, apply_iva_on_fee,
  min_price, max_price, free_shipping_threshold
)
SELECT id, 'gold_pro', 'threshold',
       12, true,
       1000, null, 8000
FROM ins2
WHERE NOT EXISTS (
  SELECT 1 FROM price_list_ml_rules mlr
  JOIN ins2 ON mlr.price_list_id = ins2.id
);
