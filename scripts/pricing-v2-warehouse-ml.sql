-- ============================================================
-- PRICING v2 — warehouse FX origin, extra_cost, ML rules
-- ============================================================

-- 1. warehouses: add base_currency
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'ARS';

-- 2. price_lists: add warehouse_id FK
ALTER TABLE price_lists
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL;

-- 3. price_list_fee_rules: add extra_cost fields
ALTER TABLE price_list_fee_rules
  ADD COLUMN IF NOT EXISTS extra_cost_amount   numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_cost_currency text          NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS extra_cost_label    text;

-- 4. price_list_ml_rules — ML-specific config per list
CREATE TABLE IF NOT EXISTS price_list_ml_rules (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id                  uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  marketplace_category           text          NOT NULL DEFAULT 'Libros',
  commission_pct                 numeric(8,4)  NOT NULL DEFAULT 17.0,
  fixed_fee                      numeric(14,2) NOT NULL DEFAULT 0,
  free_shipping_threshold        numeric(14,2) NOT NULL DEFAULT 8000,
  shipping_cost_above_threshold  numeric(14,2) NOT NULL DEFAULT 0,
  shipping_cost_below_threshold  numeric(14,2) NOT NULL DEFAULT 670,
  free_shipping_strategy         text          NOT NULL DEFAULT 'closest_profitable',
  -- ignore | prefer_above_threshold | prefer_below_threshold | closest_profitable
  free_shipping_buffer           numeric(8,4)  NOT NULL DEFAULT 2.0,
  updated_at                     timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (price_list_id)
);

CREATE INDEX IF NOT EXISTS idx_price_list_ml_rules_list ON price_list_ml_rules(price_list_id);
