-- Tabla para controlar el progreso de la importación por lotes
CREATE TABLE IF NOT EXISTS ml_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES ml_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, indexing, processing, completed, failed
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  current_offset INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de cola para los item_ids pendientes de procesar
CREATE TABLE IF NOT EXISTS ml_import_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES ml_import_jobs(id) ON DELETE CASCADE,
  ml_item_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(job_id, ml_item_id)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_ml_import_jobs_status ON ml_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ml_import_jobs_account ON ml_import_jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_ml_import_queue_status ON ml_import_queue(status);
CREATE INDEX IF NOT EXISTS idx_ml_import_queue_job ON ml_import_queue(job_id);
