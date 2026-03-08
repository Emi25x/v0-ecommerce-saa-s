-- Add finished_at to ml_import_progress to persist when a full import completes
ALTER TABLE ml_import_progress
  ADD COLUMN IF NOT EXISTS finished_at timestamp with time zone;
