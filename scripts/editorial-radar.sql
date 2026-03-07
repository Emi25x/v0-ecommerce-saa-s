-- ============================================================
-- Radar Editorial Inteligente — tablas base
-- ============================================================

-- 1. Fuentes de datos externas (feeds de tendencias)
CREATE TABLE IF NOT EXISTS editorial_radar_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('bestseller_list','isbn_db','search_trends','manual','rss')),
  url           text,
  api_key       text,
  active        boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  sync_interval_hours int NOT NULL DEFAULT 24,
  config_json   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Señales crudas capturadas de las fuentes
CREATE TABLE IF NOT EXISTS editorial_radar_signals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     uuid REFERENCES editorial_radar_sources(id) ON DELETE CASCADE,
  isbn          text,
  title         text,
  author        text,
  publisher     text,
  category      text,
  signal_type   text NOT NULL CHECK (signal_type IN ('trending','bestseller','new_release','classic','gap')),
  score         numeric(8,4) DEFAULT 0,
  rank_position int,
  metadata_json jsonb,
  captured_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radar_signals_isbn     ON editorial_radar_signals(isbn);
CREATE INDEX IF NOT EXISTS idx_radar_signals_type     ON editorial_radar_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_radar_signals_captured ON editorial_radar_signals(captured_at DESC);

-- 3. Oportunidades detectadas (procesadas de señales)
CREATE TABLE IF NOT EXISTS editorial_radar_opportunities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn              text,
  title             text NOT NULL,
  author            text,
  publisher         text,
  category          text,
  opportunity_type  text NOT NULL CHECK (opportunity_type IN ('trending','classic','gap','new_release','adaptation')),
  score             numeric(8,4) DEFAULT 0,
  confidence        text CHECK (confidence IN ('high','medium','low')),
  status            text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','approved','rejected','archived')),
  -- referencias internas
  matched_product_id uuid,  -- si ya está en nuestro catálogo
  in_catalog        boolean NOT NULL DEFAULT false,
  -- datos de mercado
  ml_sales_rank     int,
  ml_price_avg      numeric(12,2),
  ml_listings_count int,
  -- notas
  notes             text,
  tags              text[],
  source_signal_ids uuid[],
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radar_opp_type   ON editorial_radar_opportunities(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_radar_opp_status ON editorial_radar_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_radar_opp_score  ON editorial_radar_opportunities(score DESC);
CREATE INDEX IF NOT EXISTS idx_radar_opp_isbn   ON editorial_radar_opportunities(isbn);

-- 4. Adaptaciones editoriales sugeridas para nuestro catálogo
CREATE TABLE IF NOT EXISTS editorial_radar_adaptations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id    uuid REFERENCES editorial_radar_opportunities(id) ON DELETE CASCADE,
  product_id        uuid,  -- producto propio a adaptar
  adaptation_type   text NOT NULL CHECK (adaptation_type IN ('cover_refresh','price_adjustment','bundle','new_edition','reprint','format_change')),
  title             text NOT NULL,
  description       text,
  priority          text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status            text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','in_progress','done','discarded')),
  estimated_impact  text,
  assigned_to       text,
  due_date          date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 5. Resumen / snapshots periódicos para el dashboard
CREATE TABLE IF NOT EXISTS editorial_radar_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date     date NOT NULL DEFAULT CURRENT_DATE,
  total_signals     int DEFAULT 0,
  new_opps          int DEFAULT 0,
  trending_count    int DEFAULT 0,
  classic_count     int DEFAULT 0,
  gap_count         int DEFAULT 0,
  adaptation_count  int DEFAULT 0,
  top_categories    jsonb,
  top_signals       jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_snapshots_date ON editorial_radar_snapshots(snapshot_date DESC);

-- 6. Huecos de mercado detectados
CREATE TABLE IF NOT EXISTS editorial_radar_gaps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category      text NOT NULL,
  sub_category  text,
  description   text,
  demand_score  numeric(8,4) DEFAULT 0,
  supply_score  numeric(8,4) DEFAULT 0,
  gap_score     numeric(8,4) GENERATED ALWAYS AS (GREATEST(demand_score - supply_score, 0)) STORED,
  example_isbns text[],
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed','closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radar_gaps_score ON editorial_radar_gaps(gap_score DESC);
