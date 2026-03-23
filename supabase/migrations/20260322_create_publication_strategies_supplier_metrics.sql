-- ============================================================================
-- Create publication_strategies + supplier_metrics tables.
-- Publication Strategy Engine: business rules for marketplace publishing.
-- Supplier Reliability: per-product supply stability scoring.
-- ============================================================================

-- ── publication_strategies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS publication_strategies (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid        NOT NULL,
  min_margin_percent          numeric     DEFAULT 15,
  min_stock_total             integer     DEFAULT 1,
  allow_long_tail             boolean     DEFAULT true,
  long_tail_min_stock         integer     DEFAULT 1,
  prioritize_dual_supplier    boolean     DEFAULT true,
  max_price_deviation_percent numeric     DEFAULT 30,
  excluded_publishers         text[],
  preferred_publishers        text[],
  excluded_categories         text[],
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_strategies_store ON publication_strategies(store_id);

COMMENT ON TABLE  publication_strategies IS 'Business rules controlling which products are eligible for marketplace publishing.';
COMMENT ON COLUMN publication_strategies.store_id IS 'References ml_accounts.id or shopify_stores.id depending on channel.';
COMMENT ON COLUMN publication_strategies.min_margin_percent IS 'Minimum margin % required for eligibility (default 15%).';
COMMENT ON COLUMN publication_strategies.allow_long_tail IS 'If true, products with low stock can still be published if >= long_tail_min_stock.';
COMMENT ON COLUMN publication_strategies.prioritize_dual_supplier IS 'If true, products available from multiple suppliers get higher priority.';

-- ── supplier_metrics ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_metrics (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid        NOT NULL,
  ean               text        NOT NULL,
  sources_available text[],
  sources_count     integer,
  stock_total       integer,
  has_arnoia        boolean,
  has_azeta         boolean,
  has_libral        boolean,
  reliability_score numeric,
  volatility_score  numeric,
  confidence_score  numeric,
  calculated_at     timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_metrics_product ON supplier_metrics(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_metrics_ean ON supplier_metrics(ean);
CREATE INDEX IF NOT EXISTS idx_supplier_metrics_reliability ON supplier_metrics(reliability_score DESC);

COMMENT ON TABLE  supplier_metrics IS 'Per-product supply stability scoring derived from stock_by_source.';
COMMENT ON COLUMN supplier_metrics.reliability_score IS 'Higher = more reliable supply. Boosted by dual-supplier availability.';
COMMENT ON COLUMN supplier_metrics.confidence_score IS 'Normalized 0–1 value indicating data quality.';
COMMENT ON COLUMN supplier_metrics.volatility_score IS 'Higher = more volatile stock levels across sources.';
