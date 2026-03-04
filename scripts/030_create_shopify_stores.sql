-- Migration: Create shopify_stores table for multi-store support
-- This enables users to connect multiple Shopify stores to their account

CREATE TABLE IF NOT EXISTS shopify_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  shop_domain TEXT NOT NULL,
  access_token TEXT NOT NULL,
  default_location_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_shop_domain_per_user UNIQUE (owner_user_id, shop_domain)
);

CREATE INDEX idx_shopify_stores_owner ON shopify_stores(owner_user_id);
CREATE INDEX idx_shopify_stores_active ON shopify_stores(is_active);

-- Enable RLS
ALTER TABLE shopify_stores ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own stores
CREATE POLICY "Users can view their own Shopify stores"
  ON shopify_stores FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "Users can insert their own Shopify stores"
  ON shopify_stores FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Users can update their own Shopify stores"
  ON shopify_stores FOR UPDATE
  USING (owner_user_id = auth.uid());

CREATE POLICY "Users can delete their own Shopify stores"
  ON shopify_stores FOR DELETE
  USING (owner_user_id = auth.uid());
