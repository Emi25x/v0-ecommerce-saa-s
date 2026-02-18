-- Create warehouses table for managing multiple warehouse locations
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL, -- Short code for warehouse (e.g., "BCN", "MAD")
  address TEXT,
  city TEXT,
  country TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- One warehouse can be default
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_user_id, code)
);

-- Add warehouse_id to supplier_catalog_items
ALTER TABLE supplier_catalog_items 
ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_supplier_catalog_items_warehouse 
ON supplier_catalog_items(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_warehouses_owner 
ON warehouses(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_warehouses_active 
ON warehouses(is_active);

-- RLS Policies
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- Users can view their own warehouses
CREATE POLICY "Users can view own warehouses"
ON warehouses FOR SELECT
TO authenticated
USING (auth.uid() = owner_user_id);

-- Users can insert their own warehouses
CREATE POLICY "Users can insert own warehouses"
ON warehouses FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_user_id);

-- Users can update their own warehouses
CREATE POLICY "Users can update own warehouses"
ON warehouses FOR UPDATE
TO authenticated
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);

-- Users can delete their own warehouses
CREATE POLICY "Users can delete own warehouses"
ON warehouses FOR DELETE
TO authenticated
USING (auth.uid() = owner_user_id);

-- Trigger to ensure only one default warehouse per user
CREATE OR REPLACE FUNCTION ensure_single_default_warehouse()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    -- Set all other warehouses for this user to non-default
    UPDATE warehouses 
    SET is_default = false 
    WHERE owner_user_id = NEW.owner_user_id 
    AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_default_warehouse
BEFORE INSERT OR UPDATE ON warehouses
FOR EACH ROW
EXECUTE FUNCTION ensure_single_default_warehouse();
