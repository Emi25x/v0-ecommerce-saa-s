-- Add interval_hours column for "every_n_hours" frequency support
-- and update frequency CHECK constraint to include new values.
ALTER TABLE import_schedules
  ADD COLUMN IF NOT EXISTS interval_hours INTEGER DEFAULT NULL;

COMMENT ON COLUMN import_schedules.interval_hours IS
  'Hours between runs when frequency = every_n_hours (e.g. 3 = every 3 hours)';

-- Ensure frequency values are documented (no strict CHECK to avoid migration issues)
COMMENT ON COLUMN import_schedules.frequency IS
  'One of: hourly, every_n_hours, daily, weekly, monthly';
