-- editorial_radar_news: noticias de la industria audiovisual con detección de adaptaciones
CREATE TABLE IF NOT EXISTS editorial_radar_news (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  source           text NOT NULL,                    -- e.g. "Variety", "Deadline"
  url              text,
  published_at     timestamptz,
  content          text,                             -- full article text / RSS description
  detected_book    text,                             -- título del libro detectado
  detected_author  text,                             -- autor detectado
  project_type     text,                             -- 'series' | 'film' | 'unknown'
  project_status   text DEFAULT 'announced',         -- 'announced' | 'in_development' | 'in_production'
  confidence_score numeric(5,2) DEFAULT 0,
  opportunity_id   uuid REFERENCES editorial_radar_opportunities(id) ON DELETE SET NULL,
  processed        boolean DEFAULT false,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_editorial_radar_news_source       ON editorial_radar_news(source);
CREATE INDEX IF NOT EXISTS idx_editorial_radar_news_published_at ON editorial_radar_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_radar_news_processed    ON editorial_radar_news(processed);
CREATE INDEX IF NOT EXISTS idx_editorial_radar_news_confidence   ON editorial_radar_news(confidence_score DESC);
