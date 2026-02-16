-- Tabla para trackear progreso del Product Builder
CREATE TABLE IF NOT EXISTS product_builder_progress (
  account_id UUID PRIMARY KEY REFERENCES ml_accounts(id) ON DELETE CASCADE,
  publications_processed INTEGER DEFAULT 0,
  publications_total INTEGER DEFAULT 0,
  products_created INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  status TEXT DEFAULT 'idle', -- idle, running, done, error
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
