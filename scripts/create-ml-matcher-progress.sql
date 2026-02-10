-- Tabla para tracking de progreso del matcher PRO
CREATE TABLE IF NOT EXISTS ml_matcher_progress (
  account_id uuid PRIMARY KEY REFERENCES ml_accounts(id) ON DELETE CASCADE,
  total_unmatched integer DEFAULT 0,
  total_matched integer DEFAULT 0,
  last_run_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
