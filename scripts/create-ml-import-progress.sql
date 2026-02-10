-- Tabla para tracking de importación incremental por cuenta ML
-- Una fila por account_id, reanudable en cualquier momento

CREATE TABLE IF NOT EXISTS ml_import_progress (
  account_id uuid PRIMARY KEY REFERENCES ml_accounts(id) ON DELETE CASCADE,
  publications_offset int NOT NULL DEFAULT 0,
  publications_total int,
  activity_since timestamptz NOT NULL DEFAULT (now() - interval '30 days'),
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused', 'done', 'error')),
  paused_until timestamptz,
  last_error text,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_import_progress_status ON ml_import_progress(status);
CREATE INDEX IF NOT EXISTS idx_ml_import_progress_account ON ml_import_progress(account_id);

COMMENT ON TABLE ml_import_progress IS 'Tracking de importación inicial completa por cuenta ML';
COMMENT ON COLUMN ml_import_progress.publications_offset IS 'Offset actual en la paginación de publicaciones';
COMMENT ON COLUMN ml_import_progress.publications_total IS 'Total de publicaciones de la cuenta ML';
COMMENT ON COLUMN ml_import_progress.activity_since IS 'Fecha desde la cual importar actividad (órdenes, movimientos)';
COMMENT ON COLUMN ml_import_progress.status IS 'Estado actual: idle, running, paused, done, error';
COMMENT ON COLUMN ml_import_progress.paused_until IS 'Timestamp hasta el cual está pausado por rate limit';
