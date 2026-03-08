-- Add last_order_sync_at to ml_accounts if it doesn't exist
ALTER TABLE ml_accounts
  ADD COLUMN IF NOT EXISTS last_order_sync_at timestamp with time zone;
