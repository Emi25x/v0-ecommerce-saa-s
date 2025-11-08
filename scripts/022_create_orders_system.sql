-- Sistema centralizado de órdenes de todas las integraciones

-- Tabla principal de órdenes
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL, -- 'mercadolibre', 'shopify', etc.
  platform_order_id TEXT NOT NULL,
  account_id UUID, -- Referencia a ml_accounts, shopify_accounts, etc.
  order_number TEXT,
  
  -- Cliente
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address JSONB,
  
  -- Montos
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2),
  shipping DECIMAL(10,2),
  total DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'ARS',
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'shipped', 'delivered', 'cancelled'
  payment_status TEXT, -- 'pending', 'paid', 'refunded'
  
  -- Envío
  tracking_number TEXT,
  shipping_carrier TEXT,
  
  -- Datos completos
  order_data JSONB NOT NULL,
  
  -- Sincronización con Libral
  sent_to_libral BOOLEAN DEFAULT FALSE,
  libral_order_id UUID REFERENCES libral_orders(id) ON DELETE SET NULL,
  libral_sent_at TIMESTAMPTZ,
  
  -- Timestamps
  order_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(platform, platform_order_id)
);

-- Tabla de items de órdenes
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sku TEXT,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  item_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Actualizar tabla ml_accounts para soportar múltiples cuentas activas
ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(platform);
CREATE INDEX IF NOT EXISTS idx_orders_account_id ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_sent_to_libral ON orders(sent_to_libral);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

-- Comentarios
COMMENT ON TABLE orders IS 'Órdenes centralizadas de todas las integraciones (MercadoLibre, Shopify, etc.)';
COMMENT ON COLUMN orders.platform IS 'Plataforma de origen';
COMMENT ON COLUMN orders.account_id IS 'ID de la cuenta en la plataforma (para múltiples cuentas)';
COMMENT ON COLUMN orders.sent_to_libral IS 'Si la orden fue enviada a Libral ERP';
