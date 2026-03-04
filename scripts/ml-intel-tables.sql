-- ML Intel: tablas para market snapshots y oportunidades
-- Desacopladas del importer/matcher/builder

-- 1. ml_market_snapshots: datos de mercado por EAN capturados desde ML API
CREATE TABLE IF NOT EXISTS ml_market_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  ean                 text NOT NULL,
  category_id         text,
  captured_at         timestamptz NOT NULL DEFAULT now(),
  min_price           numeric,
  median_price        numeric,
  avg_price           numeric,
  sellers_count       int,
  full_sellers_count  int,
  free_shipping_rate  numeric,
  sold_qty_proxy      int,
  sample_item_ids     jsonb DEFAULT '[]',
  captured_day        date NOT NULL DEFAULT CURRENT_DATE
);

-- Índice para upsert por día (account_id + ean + fecha)
CREATE UNIQUE INDEX IF NOT EXISTS ml_market_snapshots_daily_uq
  ON ml_market_snapshots (account_id, ean, captured_day);

-- Índice para consultas por cuenta y ean
CREATE INDEX IF NOT EXISTS ml_market_snapshots_account_ean_idx
  ON ml_market_snapshots (account_id, ean, captured_at DESC);

-- 2. ml_opportunities: oportunidades detectadas por cuenta
CREATE TABLE IF NOT EXISTS ml_opportunities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  ean                 text NOT NULL,
  title               text,
  category_id         text,
  min_price           numeric,
  median_price        numeric,
  sellers_count       int,
  full_sellers_count  int,
  sold_qty_proxy      int,
  opportunity_score   numeric,
  status              text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'ignored', 'published')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Upsert por (account_id, ean)
CREATE UNIQUE INDEX IF NOT EXISTS ml_opportunities_account_ean_uq
  ON ml_opportunities (account_id, ean);

CREATE INDEX IF NOT EXISTS ml_opportunities_account_status_idx
  ON ml_opportunities (account_id, status, opportunity_score DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_ml_opportunities_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ml_opportunities_updated_at ON ml_opportunities;
CREATE TRIGGER ml_opportunities_updated_at
  BEFORE UPDATE ON ml_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_ml_opportunities_updated_at();
