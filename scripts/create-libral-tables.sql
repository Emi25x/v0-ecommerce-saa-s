-- Create Libral integration tables

-- Libral accounts table
CREATE TABLE IF NOT EXISTS libral_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Libral orders table (for tracking orders sent to Libral)
CREATE TABLE IF NOT EXISTS libral_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_data JSONB NOT NULL,
  libral_response JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_libral_accounts_username ON libral_accounts(username);
CREATE INDEX IF NOT EXISTS idx_libral_accounts_expires_at ON libral_accounts(expires_at);
CREATE INDEX IF NOT EXISTS idx_libral_orders_status ON libral_orders(status);
CREATE INDEX IF NOT EXISTS idx_libral_orders_created_at ON libral_orders(created_at);

-- Add RLS policies
ALTER TABLE libral_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE libral_orders ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own data
CREATE POLICY "Users can read their own libral accounts" ON libral_accounts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own libral accounts" ON libral_accounts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own libral accounts" ON libral_accounts
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can read their own libral orders" ON libral_orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own libral orders" ON libral_orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
