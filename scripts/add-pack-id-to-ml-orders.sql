-- Agrega pack_id a ml_orders para mejorar el upload de facturas a ML.
-- ML usa /packs/{pack_id}/fiscal_documents como endpoint para subir facturas.
-- Si pack_id es NULL, se usa ml_order_id como fallback.
ALTER TABLE ml_orders ADD COLUMN IF NOT EXISTS pack_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ml_orders_pack_id ON ml_orders (pack_id) WHERE pack_id IS NOT NULL;
