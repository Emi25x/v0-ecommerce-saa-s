-- Create table for storing integration configurations
CREATE TABLE IF NOT EXISTS integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name TEXT NOT NULL UNIQUE,
  credentials JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_integration_configs_name ON integration_configs(integration_name);
CREATE INDEX IF NOT EXISTS idx_integration_configs_active ON integration_configs(is_active);

-- Add RLS policies
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON integration_configs
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON integration_configs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON integration_configs
  FOR UPDATE USING (true);
