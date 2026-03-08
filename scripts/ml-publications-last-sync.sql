-- Add missing columns to ml_publications if they don't exist yet
ALTER TABLE ml_publications
  ADD COLUMN IF NOT EXISTS catalog_listing          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_sync_at             timestamptz;
