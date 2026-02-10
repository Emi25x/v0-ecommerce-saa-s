-- Add owner_id to ml_accounts for security
-- This allows validating that users can only access their own ML accounts

-- Add owner_id column (nullable for backward compatibility)
ALTER TABLE ml_accounts 
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Set owner_id to first authenticated user for existing accounts (temporary fix)
-- In production, this should be set based on who created the account
UPDATE ml_accounts 
SET owner_id = (SELECT id FROM auth.users LIMIT 1)
WHERE owner_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_ml_accounts_owner_id ON ml_accounts(owner_id);

-- Add comment
COMMENT ON COLUMN ml_accounts.owner_id IS 'User who owns this MercadoLibre account connection';
