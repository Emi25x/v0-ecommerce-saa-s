-- Tabla para trackear qué órdenes de Shopify ya fueron facturadas
-- Similar a ml_order_facturas pero para Shopify

CREATE TABLE IF NOT EXISTS shopify_order_facturas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shopify_order_id text        NOT NULL,
  store_id         uuid        NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  factura_id       uuid        REFERENCES facturas(id) ON DELETE SET NULL,
  empresa_id       uuid        REFERENCES arca_config(id) ON DELETE SET NULL,
  facturado_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shopify_order_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_order_facturas_user    ON shopify_order_facturas (user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_order_facturas_store   ON shopify_order_facturas (store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_order_facturas_factura ON shopify_order_facturas (factura_id);
CREATE INDEX IF NOT EXISTS idx_shopify_order_facturas_order   ON shopify_order_facturas (shopify_order_id);
