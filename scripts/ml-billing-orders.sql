-- Tabla para registrar qué órdenes de ML fueron facturadas y con qué factura
CREATE TABLE IF NOT EXISTS ml_order_facturas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ml_order_id     bigint NOT NULL,
  ml_account_id   text NOT NULL,        -- seller_id de la cuenta ML
  factura_id      uuid REFERENCES facturas(id) ON DELETE SET NULL,
  empresa_id      uuid REFERENCES arca_config(id) ON DELETE SET NULL,
  facturado_at    timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(ml_order_id, ml_account_id)
);

CREATE INDEX IF NOT EXISTS idx_ml_order_facturas_user    ON ml_order_facturas(user_id);
CREATE INDEX IF NOT EXISTS idx_ml_order_facturas_order   ON ml_order_facturas(ml_order_id);
CREATE INDEX IF NOT EXISTS idx_ml_order_facturas_account ON ml_order_facturas(ml_account_id);

-- RLS
ALTER TABLE ml_order_facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ml_order_facturas_owner" ON ml_order_facturas
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

SELECT 'ok' AS status;
