-- Tabla de jobs para el scan de mercado (job-based, cursor-driven)
CREATE TABLE IF NOT EXISTS market_scan_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL,
  status              text NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | cancelled
  cursor              integer NOT NULL DEFAULT 0,      -- offset de pubs ya procesadas
  batch_size          integer NOT NULL DEFAULT 200,
  total_estimated     integer NOT NULL DEFAULT 0,
  scanned             integer NOT NULL DEFAULT 0,      -- EANs consultados en ML
  skipped_cached      integer NOT NULL DEFAULT 0,
  skipped_invalid     integer NOT NULL DEFAULT 0,
  errors              integer NOT NULL DEFAULT 0,
  started_at          timestamptz,
  ended_at            timestamptz,
  last_heartbeat_at   timestamptz,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_scan_jobs_account_status
  ON market_scan_jobs (account_id, status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_market_scan_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_market_scan_jobs_updated_at ON market_scan_jobs;
CREATE TRIGGER trg_market_scan_jobs_updated_at
  BEFORE UPDATE ON market_scan_jobs
  FOR EACH ROW EXECUTE FUNCTION update_market_scan_jobs_updated_at();
