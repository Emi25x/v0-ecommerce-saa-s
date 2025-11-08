-- Tabla para almacenar competidores monitoreados
CREATE TABLE IF NOT EXISTS competition_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  ml_listing_id UUID REFERENCES ml_listings(id) ON DELETE CASCADE,
  search_query TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para almacenar snapshots de competencia
CREATE TABLE IF NOT EXISTS competition_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id UUID REFERENCES competition_tracking(id) ON DELETE CASCADE,
  competitor_ml_id TEXT NOT NULL,
  competitor_title TEXT,
  competitor_price NUMERIC(10, 2),
  competitor_available_quantity INTEGER,
  competitor_sold_quantity INTEGER,
  competitor_listing_type TEXT,
  competitor_seller_id TEXT,
  competitor_permalink TEXT,
  competitor_thumbnail TEXT,
  position_in_search INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_competition_tracking_product ON competition_tracking(product_id);
CREATE INDEX IF NOT EXISTS idx_competition_tracking_listing ON competition_tracking(ml_listing_id);
CREATE INDEX IF NOT EXISTS idx_competition_snapshots_tracking ON competition_snapshots(tracking_id);
CREATE INDEX IF NOT EXISTS idx_competition_snapshots_created ON competition_snapshots(created_at DESC);

-- Tabla para alertas de precios
CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id UUID REFERENCES competition_tracking(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'price_below', 'price_above', 'new_competitor'
  threshold_value NUMERIC(10, 2),
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
