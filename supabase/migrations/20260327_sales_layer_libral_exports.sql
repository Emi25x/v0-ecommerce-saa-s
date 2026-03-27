-- ============================================================================
-- SALES LAYER + LIBRAL ORDER EXPORT
-- Extends existing orders system for Libral integration
-- ============================================================================

-- 1. Add platform_code and company_name to ml_accounts
ALTER TABLE ml_accounts
  ADD COLUMN IF NOT EXISTS platform_code TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT;

COMMENT ON COLUMN ml_accounts.platform_code IS 'Libral platform identifier: C1, C2, C3, C4';
COMMENT ON COLUMN ml_accounts.company_name IS 'Razón social fija para esta cuenta (ej: Valletta Ediciones)';

-- 2. Add platform_code and company_name to shopify_stores
ALTER TABLE shopify_stores
  ADD COLUMN IF NOT EXISTS platform_code TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT;

COMMENT ON COLUMN shopify_stores.platform_code IS 'Libral platform identifier: SP1, SP2';
COMMENT ON COLUMN shopify_stores.company_name IS 'Razón social fija para esta tienda (ej: Valletta Ediciones)';

-- 3. Add Libral-specific columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS platform_code TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS libral_reference TEXT,
  ADD COLUMN IF NOT EXISTS libral_status TEXT DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS export_error TEXT,
  ADD COLUMN IF NOT EXISTS last_export_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.platform_code IS 'C1, C2, C3, C4, SP1, SP2';
COMMENT ON COLUMN orders.company_name IS 'Razón social emisora (copiada de cuenta al sincronizar)';
COMMENT ON COLUMN orders.libral_reference IS 'Referencia única: <platform_code>-<channel_order_id>';
COMMENT ON COLUMN orders.libral_status IS 'not_ready, pending_export, export_blocked, sent, failed, cancel_pending, cancelled_in_erp, cancel_failed, cancelled_not_sent';
COMMENT ON COLUMN orders.export_error IS 'Último error de exportación a Libral';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_libral_reference
  ON orders (libral_reference) WHERE libral_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_libral_status
  ON orders (libral_status) WHERE libral_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_platform_code
  ON orders (platform_code) WHERE platform_code IS NOT NULL;

-- 4. Add ean column to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS ean TEXT;

COMMENT ON COLUMN order_items.ean IS 'EAN del producto, requerido para exportar a Libral';

CREATE INDEX IF NOT EXISTS idx_order_items_ean
  ON order_items (ean) WHERE ean IS NOT NULL;

-- 5. Create libral_order_exports audit table
CREATE TABLE IF NOT EXISTS libral_order_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  platform_code TEXT NOT NULL,
  reference TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'create', -- 'create' or 'delete'
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending, sent, failed, cancel_pending, cancelled_in_erp, cancel_failed
  payload_json JSONB,
  response_text TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_libral_exports_reference
  ON libral_order_exports (reference);

CREATE INDEX IF NOT EXISTS idx_libral_exports_status
  ON libral_order_exports (status);

CREATE INDEX IF NOT EXISTS idx_libral_exports_order
  ON libral_order_exports (order_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_libral_exports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_libral_exports_updated_at ON libral_order_exports;
CREATE TRIGGER trigger_libral_exports_updated_at
  BEFORE UPDATE ON libral_order_exports
  FOR EACH ROW EXECUTE FUNCTION update_libral_exports_updated_at();
