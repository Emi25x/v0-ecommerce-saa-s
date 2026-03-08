-- Audit columns for ML import-pro: track items seen vs actually persisted
ALTER TABLE ml_import_progress
  ADD COLUMN IF NOT EXISTS ml_items_seen_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS db_rows_upserted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upsert_errors_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_batch_at     timestamp with time zone;
