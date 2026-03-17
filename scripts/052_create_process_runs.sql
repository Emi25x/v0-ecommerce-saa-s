-- 052: Create process_runs table for unified audit trail of all batch/sync processes
-- Provides a single place to see when any process ran, how long it took,
-- what it accomplished, and whether it succeeded or failed.

CREATE TABLE IF NOT EXISTS process_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type  TEXT NOT NULL,          -- e.g. 'arnoia_stock', 'ml_sync_stock', 'shopify_sync'
  process_name  TEXT,                   -- human-readable, e.g. 'Arnoia Stock Diario'
  status        TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'completed', 'failed')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  duration_ms   INTEGER,
  rows_processed INTEGER DEFAULT 0,
  rows_created   INTEGER DEFAULT 0,
  rows_updated   INTEGER DEFAULT 0,
  rows_failed    INTEGER DEFAULT 0,
  error_message  TEXT,
  log_json       JSONB DEFAULT '{}'::jsonb,  -- process-specific details
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying recent runs by process type
CREATE INDEX IF NOT EXISTS idx_process_runs_type_started
  ON process_runs (process_type, started_at DESC);

-- Index for querying failed runs
CREATE INDEX IF NOT EXISTS idx_process_runs_status
  ON process_runs (status) WHERE status = 'failed';

-- RLS: allow service role full access (used server-side only)
ALTER TABLE process_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on process_runs"
  ON process_runs
  FOR ALL
  USING (true)
  WITH CHECK (true);
