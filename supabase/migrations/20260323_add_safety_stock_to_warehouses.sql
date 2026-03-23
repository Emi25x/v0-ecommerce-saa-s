-- Add safety_stock column to warehouses table
-- Used to reserve a minimum stock buffer per warehouse.
-- publishable_stock = max(0, warehouse_stock - safety_stock)
ALTER TABLE warehouses
ADD COLUMN IF NOT EXISTS safety_stock INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN warehouses.safety_stock IS 'Minimum stock buffer to reserve per warehouse. Publishable stock = max(0, warehouse_stock - safety_stock)';
