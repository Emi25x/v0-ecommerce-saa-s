-- ============================================================
-- PRICING ENGINE — Migration
-- ============================================================

-- 1. price_lists
CREATE TABLE IF NOT EXISTS price_lists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  channel         text NOT NULL DEFAULT 'ml',        -- ml | shopify | web | mayorista
  country_code    text NOT NULL DEFAULT 'AR',
  currency        text NOT NULL DEFAULT 'ARS',
  pricing_base    text NOT NULL DEFAULT 'cost',       -- cost | pvp | hybrid
  is_active       boolean NOT NULL DEFAULT true,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. price_list_rules  (1 row per list)
CREATE TABLE IF NOT EXISTS price_list_rules (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id               uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  fx_rate                     numeric(14,6) NOT NULL DEFAULT 1,
  fx_markup_pct               numeric(8,4)  NOT NULL DEFAULT 0,
  margin_target_pct           numeric(8,4)  NOT NULL DEFAULT 30,
  margin_min_pct              numeric(8,4)  NOT NULL DEFAULT 10,
  rounding_rule               text          NOT NULL DEFAULT 'none',  -- none | ceil_10 | ceil_100 | round_99
  includes_tax                boolean       NOT NULL DEFAULT false,
  default_import_shipping_cost numeric(14,2) NOT NULL DEFAULT 0,
  use_best_supplier           boolean       NOT NULL DEFAULT true,
  pvp_discount_pct            numeric(8,4)  NOT NULL DEFAULT 0,
  updated_at                  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (price_list_id)
);

-- 3. price_list_fee_rules  (tramos)
CREATE TABLE IF NOT EXISTS price_list_fee_rules (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id                 uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  min_price                     numeric(14,2),
  max_price                     numeric(14,2),
  commission_pct                numeric(8,4)  NOT NULL DEFAULT 0,
  fixed_fee                     numeric(14,2) NOT NULL DEFAULT 0,
  free_shipping_threshold       numeric(14,2),
  shipping_cost_above_threshold numeric(14,2) NOT NULL DEFAULT 0,
  shipping_cost_below_threshold numeric(14,2) NOT NULL DEFAULT 0,
  absorb_shipping_mode          text          NOT NULL DEFAULT 'none'   -- none | partial | full
);

-- 4. price_list_assignments
CREATE TABLE IF NOT EXISTS price_list_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  entity_type   text NOT NULL,   -- ml_account | shopify_store | channel | warehouse | campaign
  entity_id     text NOT NULL,
  priority      int  NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

-- 5. exchange_rates
CREATE TABLE IF NOT EXISTS exchange_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency   text NOT NULL,
  rate          numeric(14,6) NOT NULL,
  source        text,
  is_manual     boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_currency, to_currency)
);

-- 6. product_costs
CREATE TABLE IF NOT EXISTS product_costs (
  product_id            uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  best_supplier_id      uuid,
  supplier_cost         numeric(14,2),
  import_shipping_cost  numeric(14,2) NOT NULL DEFAULT 0,
  total_cost            numeric(14,2) GENERATED ALWAYS AS (COALESCE(supplier_cost,0) + import_shipping_cost) STORED,
  source_currency       text NOT NULL DEFAULT 'ARS',
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 7. product_prices
CREATE TABLE IF NOT EXISTS product_prices (
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_list_id       uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  calculated_price    numeric(14,2),
  calculated_margin   numeric(8,4),
  base_cost           numeric(14,2),
  base_pvp            numeric(14,2),
  pricing_base_used   text,
  fx_used             numeric(14,6),
  commission_amount   numeric(14,2),
  fixed_fee_amount    numeric(14,2),
  shipping_cost_amount numeric(14,2),
  calculation_json    jsonb,
  has_warnings        boolean NOT NULL DEFAULT false,
  margin_below_min    boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, price_list_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_price_list_fee_rules_list   ON price_list_fee_rules(price_list_id);
CREATE INDEX IF NOT EXISTS idx_price_list_assignments_list  ON price_list_assignments(price_list_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_list          ON product_prices(price_list_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_warnings      ON product_prices(has_warnings) WHERE has_warnings = true;
