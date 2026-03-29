-- ============================================================
-- IMPORT PIPELINE: Multi-step worker with checkpoint tracking
--
-- Instead of one long-running function, the pipeline runs in
-- multiple short invocations (~30s each), tracking progress
-- in import_pipeline_state.
-- ============================================================

CREATE TABLE IF NOT EXISTS import_pipeline_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  source_id UUID NOT NULL,
  source_key TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'stock_only',
  phase TEXT NOT NULL DEFAULT 'staged',
    -- staged → merging → zeroing → refreshing → done / failed
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  merge_offset INTEGER NOT NULL DEFAULT 0,
  merge_batch_size INTEGER NOT NULL DEFAULT 5000,
  merged_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  zeroed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pipeline_state_run ON import_pipeline_state (run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_state_phase ON import_pipeline_state (phase) WHERE phase != 'done';
