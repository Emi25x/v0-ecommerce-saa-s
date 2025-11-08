-- Tabla para configuración de seguimiento automático de precios
CREATE TABLE IF NOT EXISTS price_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_listing_id TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT false,
  min_price NUMERIC(10, 2) NOT NULL, -- Precio mínimo que no se quiere bajar
  current_price_to_win NUMERIC(10, 2), -- Último precio para ganar conocido
  last_checked_at TIMESTAMP WITH TIME ZONE,
  last_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_price_tracking_ml_listing ON price_tracking(ml_listing_id);
CREATE INDEX IF NOT EXISTS idx_price_tracking_enabled ON price_tracking(enabled) WHERE enabled = true;

-- Tabla para historial de cambios automáticos de precio
CREATE TABLE IF NOT EXISTS price_tracking_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_listing_id TEXT NOT NULL,
  old_price NUMERIC(10, 2) NOT NULL,
  new_price NUMERIC(10, 2) NOT NULL,
  price_to_win NUMERIC(10, 2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_tracking_history_ml_listing ON price_tracking_history(ml_listing_id);
CREATE INDEX IF NOT EXISTS idx_price_tracking_history_created_at ON price_tracking_history(created_at DESC);

COMMENT ON TABLE price_tracking IS 'Configuración de seguimiento automático de precios para competencia';
COMMENT ON TABLE price_tracking_history IS 'Historial de cambios automáticos de precio';
