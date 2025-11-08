-- Add browser preference field to ml_accounts table
ALTER TABLE ml_accounts 
ADD COLUMN IF NOT EXISTS browser_preference TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN ml_accounts.browser_preference IS 'Preferred browser/profile for this ML account (e.g., "Chrome Profile 1", "Firefox", "Chrome Incognito")';
