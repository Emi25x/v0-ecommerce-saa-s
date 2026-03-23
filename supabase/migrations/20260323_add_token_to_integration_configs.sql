-- Add token and token_expires_at columns to integration_configs
-- Required by Libral stock-import which stores/reads JWT tokens here

ALTER TABLE integration_configs
  ADD COLUMN IF NOT EXISTS token TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- Index for fast token expiration checks
CREATE INDEX IF NOT EXISTS idx_integration_configs_token_expiry
  ON integration_configs(token_expires_at)
  WHERE token IS NOT NULL;
