-- Create import_jobs table to track server-side import progress
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES import_sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  total_products INTEGER DEFAULT 0,
  processed_products INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0,
  current_speed NUMERIC DEFAULT 0, -- products per second
  elapsed_time INTEGER DEFAULT 0, -- seconds
  estimated_time_remaining INTEGER DEFAULT 0, -- seconds
  error_details JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_import_jobs_source_id ON import_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at DESC);

-- Add comment
COMMENT ON TABLE import_jobs IS 'Tracks server-side import job progress for real-time updates';
