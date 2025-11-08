-- Crear tabla price_tracking si no existe
CREATE TABLE IF NOT EXISTS price_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_id TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT false,
  min_price DECIMAL(10, 2),
  last_price_to_win DECIMAL(10, 2),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear tabla price_tracking_history si no existe
CREATE TABLE IF NOT EXISTS price_tracking_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_id TEXT NOT NULL,
  old_price DECIMAL(10, 2),
  new_price DECIMAL(10, 2),
  price_to_win DECIMAL(10, 2),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear tabla ml_shipments si no existe
CREATE TABLE IF NOT EXISTS ml_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_id TEXT NOT NULL UNIQUE,
  order_id TEXT,
  status TEXT,
  tracking_number TEXT,
  carrier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_price_tracking_ml_id ON price_tracking(ml_id);
CREATE INDEX IF NOT EXISTS idx_price_tracking_enabled ON price_tracking(enabled);
CREATE INDEX IF NOT EXISTS idx_price_tracking_history_ml_id ON price_tracking_history(ml_id);
CREATE INDEX IF NOT EXISTS idx_ml_shipments_ml_id ON ml_shipments(ml_id);
CREATE INDEX IF NOT EXISTS idx_ml_shipments_status ON ml_shipments(status);
