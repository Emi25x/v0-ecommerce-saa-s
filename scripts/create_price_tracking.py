import os
from supabase import create_client, Client

# Get Supabase credentials from environment variables
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required")
    exit(1)

# Create Supabase client
supabase: Client = create_client(supabase_url, supabase_key)

print("[v0] Creating price_tracking table...")

# SQL to create the price_tracking table
create_table_sql = """
-- Create price_tracking table
CREATE TABLE IF NOT EXISTS public.price_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ml_id TEXT NOT NULL UNIQUE,
    account_id UUID REFERENCES public.ml_accounts(id) ON DELETE CASCADE,
    auto_update_enabled BOOLEAN DEFAULT false,
    min_price NUMERIC(10, 2) NOT NULL,
    last_price_update TIMESTAMP WITH TIME ZONE,
    last_checked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on ml_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_price_tracking_ml_id ON public.price_tracking(ml_id);

-- Create index on auto_update_enabled for filtering active tracking
CREATE INDEX IF NOT EXISTS idx_price_tracking_auto_update ON public.price_tracking(auto_update_enabled) WHERE auto_update_enabled = true;

-- Create index on account_id for filtering by account
CREATE INDEX IF NOT EXISTS idx_price_tracking_account_id ON public.price_tracking(account_id);
"""

try:
    # Execute the SQL using Supabase's RPC or direct SQL execution
    # Note: Supabase Python client doesn't have direct SQL execution, so we'll use the REST API
    response = supabase.rpc('exec_sql', {'sql': create_table_sql}).execute()
    print("[v0] Successfully created price_tracking table and indexes")
    print(f"[v0] Response: {response}")
except Exception as e:
    # If RPC doesn't exist, try alternative method
    print(f"[v0] Note: {str(e)}")
    print("[v0] Please run the following SQL manually in your Supabase SQL editor:")
    print(create_table_sql)
