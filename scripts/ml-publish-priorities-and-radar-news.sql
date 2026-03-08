-- ml_publish_priorities: stores computed publish priority scores per product
CREATE TABLE IF NOT EXISTS ml_publish_priorities (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id             uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  company_id             uuid,
  ml_account_id          uuid REFERENCES ml_accounts(id) ON DELETE SET NULL,
  publish_priority_score numeric(5,2) NOT NULL DEFAULT 0,
  priority_level         text NOT NULL DEFAULT 'low'
    CHECK (priority_level IN ('critical','high','medium','low')),
  recommended_action     text NOT NULL DEFAULT 'no_priorizar'
    CHECK (recommended_action IN ('crear_publicacion','reactivar_publicacion','mejorar_publicacion','comprar_stock','no_priorizar')),
  reason_summary         text,
  score_demand           numeric(5,2) DEFAULT 0,
  score_competition      numeric(5,2) DEFAULT 0,
  score_stock            numeric(5,2) DEFAULT 0,
  score_profitability    numeric(5,2) DEFAULT 0,
  score_radar_boost      numeric(5,2) DEFAULT 0,
  has_inactive_listing   boolean DEFAULT false,
  active_listings_count  integer DEFAULT 0,
  stock_total            integer DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, ml_account_id)
);

CREATE INDEX IF NOT EXISTS idx_ml_publish_priorities_score
  ON ml_publish_priorities(publish_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_ml_publish_priorities_product
  ON ml_publish_priorities(product_id);

-- editorial_radar_news: RSS articles fetched from industry news sources
CREATE TABLE IF NOT EXISTS editorial_radar_news (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  source           text NOT NULL,
  url              text NOT NULL UNIQUE,
  published_at     timestamptz,
  content          text,
  detected_book    text,
  detected_author  text,
  project_type     text CHECK (project_type IN ('serie','pelicula','proyecto','acuerdo_derechos')),
  project_status   text CHECK (project_status IN ('anunciado','en_desarrollo','en_produccion','estrenado')),
  confidence_score numeric(4,2) DEFAULT 0,
  opportunity_id   uuid REFERENCES editorial_radar_opportunities(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_editorial_radar_news_confidence
  ON editorial_radar_news(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_radar_news_source
  ON editorial_radar_news(source);
CREATE INDEX IF NOT EXISTS idx_editorial_radar_news_published
  ON editorial_radar_news(published_at DESC);
