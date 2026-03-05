-- shopify_location_mappings: maps our warehouses to Shopify location IDs
-- One row per (store, warehouse) pair.

CREATE TABLE IF NOT EXISTS shopify_location_mappings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  warehouse_id        uuid NOT NULL REFERENCES warehouses(id)     ON DELETE CASCADE,
  shopify_location_id text NOT NULL,   -- numeric string, e.g. "67890123456"
  location_name       text,            -- cached display name from Shopify
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (store_id, warehouse_id)
);

-- Also ensure shopify_stores has a currency column (used in push)
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS currency text DEFAULT 'ARS';
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS api_version text DEFAULT '2024-01';
