-- Tabla para la cola de webhooks de MercadoLibre
CREATE TABLE IF NOT EXISTS ml_webhook_queue (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  resource TEXT NOT NULL,
  user_id TEXT NOT NULL,
  application_id TEXT,
  sent TIMESTAMP,
  received TIMESTAMP,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_queue_processed ON ml_webhook_queue (processed, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_queue_user ON ml_webhook_queue (user_id);

-- Tabla para almacenar órdenes de MercadoLibre
CREATE TABLE IF NOT EXISTS ml_orders (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT,
  status_detail TEXT,
  buyer_id BIGINT,
  buyer_nickname TEXT,
  total_amount DECIMAL(10, 2),
  currency_id TEXT,
  date_created TIMESTAMP,
  date_closed TIMESTAMP,
  last_updated TIMESTAMP,
  order_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(order_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON ml_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON ml_orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON ml_orders (date_created);

-- Tabla para almacenar envíos de MercadoLibre
CREATE TABLE IF NOT EXISTS ml_shipments (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  order_id BIGINT,
  status TEXT,
  substatus TEXT,
  tracking_number TEXT,
  tracking_method TEXT,
  date_created TIMESTAMP,
  last_updated TIMESTAMP,
  shipment_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shipment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shipments_user ON ml_shipments (user_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON ml_shipments (order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON ml_shipments (status);
CREATE INDEX IF NOT EXISTS idx_shipments_date ON ml_shipments (date_created);

-- Tabla para almacenar productos de MercadoLibre
CREATE TABLE IF NOT EXISTS ml_products (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT,
  status TEXT,
  price DECIMAL(10, 2),
  available_quantity INTEGER,
  sold_quantity INTEGER,
  permalink TEXT,
  thumbnail TEXT,
  product_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_products_user ON ml_products (user_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON ml_products (status);

-- Tabla para logs de webhooks (debugging y monitoreo)
CREATE TABLE IF NOT EXISTS ml_webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  resource TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_date ON ml_webhook_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON ml_webhook_logs (status_code);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_user ON ml_webhook_logs (user_id);
