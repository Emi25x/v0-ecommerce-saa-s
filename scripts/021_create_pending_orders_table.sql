-- Nueva tabla para órdenes pendientes de envío a Libral

CREATE TABLE IF NOT EXISTS pending_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL, -- 'mercadolibre', 'shopify', etc.
  platform_order_id TEXT NOT NULL,
  order_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'error'
  libral_order_id UUID REFERENCES libral_orders(id) ON DELETE SET NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(platform, platform_order_id)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_pending_orders_status ON pending_orders(status);
CREATE INDEX IF NOT EXISTS idx_pending_orders_platform ON pending_orders(platform);
CREATE INDEX IF NOT EXISTS idx_pending_orders_created ON pending_orders(created_at DESC);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_pending_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pending_orders_updated_at
  BEFORE UPDATE ON pending_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_pending_orders_updated_at();

COMMENT ON TABLE pending_orders IS 'Órdenes de marketplaces pendientes de envío a Libral';
COMMENT ON COLUMN pending_orders.platform IS 'Plataforma de origen (mercadolibre, shopify, etc.)';
COMMENT ON COLUMN pending_orders.platform_order_id IS 'ID de la orden en la plataforma original';
COMMENT ON COLUMN pending_orders.order_data IS 'Datos completos de la orden';
COMMENT ON COLUMN pending_orders.status IS 'Estado del procesamiento';
COMMENT ON COLUMN pending_orders.libral_order_id IS 'Referencia a la orden creada en Libral';
COMMENT ON COLUMN pending_orders.retry_count IS 'Número de reintentos de envío';
