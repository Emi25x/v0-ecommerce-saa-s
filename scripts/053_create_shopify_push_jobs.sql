-- 053: Shopify push jobs — server-side queue for bulk product push
-- Allows push to continue without browser, tracked per-EAN.

CREATE TABLE IF NOT EXISTS shopify_push_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  -- EAN list and per-item status
  eans TEXT[] NOT NULL DEFAULT '{}',
  completed_eans TEXT[] NOT NULL DEFAULT '{}',
  failed_eans JSONB NOT NULL DEFAULT '[]',  -- [{ean, error}]

  total_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,

  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopify_push_jobs_status
  ON shopify_push_jobs(status) WHERE status IN ('pending', 'running');

COMMENT ON TABLE shopify_push_jobs IS 'Server-side queue for bulk Shopify product push. Each row = one push job with N EANs.';
