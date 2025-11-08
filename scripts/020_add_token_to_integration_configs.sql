-- Add token fields to integration_configs table
ALTER TABLE integration_configs 
ADD COLUMN IF NOT EXISTS token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- Create index for token expiration checks
CREATE INDEX IF NOT EXISTS idx_integration_configs_token_expiry 
ON integration_configs(token_expires_at) 
WHERE token IS NOT NULL;
