-- Migración: Observabilidad y progreso del Matcher PRO
-- Objetivo: Instrumentar el matcher sin cambiar lógica de matching

-- 1) Enum para estados del run
CREATE TYPE matcher_run_status AS ENUM ('running', 'completed', 'failed', 'canceled');

-- 2) Enum para outcomes de matching
CREATE TYPE matcher_outcome AS ENUM (
  'matched',           -- vinculado exitosamente a 1 producto
  'ambiguous',         -- múltiples coincidencias (2+)
  'not_found',         -- identificador válido pero sin coincidencias
  'invalid',           -- identificador inválido o mal formateado
  'skipped',           -- ya estaba vinculado o sin identificador
  'error'              -- error durante procesamiento
);

-- 3) Tabla de corridas del matcher
CREATE TABLE IF NOT EXISTS matcher_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT NOW(),
  finished_at timestamptz,
  status matcher_run_status NOT NULL DEFAULT 'running',
  time_budget_seconds int NOT NULL DEFAULT 30,
  batch_size int NOT NULL DEFAULT 100,
  cursor jsonb,  -- para reanudar: {last_publication_id, offset, etc}
  
  -- Totales finales (snapshot al terminar)
  totals jsonb DEFAULT '{
    "scanned": 0,
    "candidates": 0,
    "matched": 0,
    "ambiguous": 0,
    "not_found": 0,
    "invalid_id": 0,
    "skipped": 0,
    "errors": 0
  }'::jsonb,
  
  last_error text,
  last_heartbeat_at timestamptz DEFAULT NOW(),
  
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matcher_runs_account_status ON matcher_runs(account_id, status);
CREATE INDEX idx_matcher_runs_started ON matcher_runs(started_at DESC);

COMMENT ON TABLE matcher_runs IS 'Registro de cada corrida del matcher con métricas finales';
COMMENT ON COLUMN matcher_runs.cursor IS 'Estado para reanudar: last_publication_id, offset, etc';
COMMENT ON COLUMN matcher_runs.totals IS 'Snapshot final de métricas al completar';

-- 4) Tabla de progreso incremental (actualizado cada N items)
CREATE TABLE IF NOT EXISTS matcher_run_progress (
  run_id uuid PRIMARY KEY REFERENCES matcher_runs(id) ON DELETE CASCADE,
  
  scanned_count int NOT NULL DEFAULT 0,
  candidate_count int NOT NULL DEFAULT 0,
  matched_count int NOT NULL DEFAULT 0,
  ambiguous_count int NOT NULL DEFAULT 0,
  not_found_count int NOT NULL DEFAULT 0,
  invalid_id_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  
  current_batch int NOT NULL DEFAULT 0,
  items_per_second numeric(10,2),
  estimated_seconds_remaining int,
  
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE matcher_run_progress IS 'Progreso incremental de la corrida actual (actualizado cada ~200 items)';

-- 5) Tabla de resultados detallados para trazabilidad
CREATE TABLE IF NOT EXISTS matcher_results (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES matcher_runs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  
  ml_publication_id uuid NOT NULL REFERENCES ml_publications(id) ON DELETE CASCADE,
  ml_item_id text NOT NULL,
  
  identifier_type text,  -- isbn|ean|gtin|sku
  identifier_value_normalized text,  -- valor normalizado usado para matching
  
  outcome matcher_outcome NOT NULL,
  matched_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  match_count int,  -- cuántas coincidencias encontró
  reason_code text NOT NULL,  -- EXACT_MATCH, MULTIPLE_MATCHES, NO_MATCH, etc
  
  debug jsonb,  -- opcional: {candidate_ids: [], notes: "", timing_ms: N}
  
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Índices para búsquedas eficientes
CREATE INDEX idx_matcher_results_run_id ON matcher_results(run_id);
CREATE INDEX idx_matcher_results_account_outcome ON matcher_results(account_id, outcome);
CREATE INDEX idx_matcher_results_publication ON matcher_results(ml_publication_id);
CREATE INDEX idx_matcher_results_reason ON matcher_results(reason_code);
CREATE INDEX idx_matcher_results_created ON matcher_results(created_at DESC);

COMMENT ON TABLE matcher_results IS 'Resultados detallados de cada publicación procesada por el matcher';
COMMENT ON COLUMN matcher_results.identifier_value_normalized IS 'Identificador normalizado (sin guiones/espacios) usado en la búsqueda';
COMMENT ON COLUMN matcher_results.match_count IS 'Cuántos productos coincidieron (0=not_found, 1=matched, 2+=ambiguous)';
COMMENT ON COLUMN matcher_results.reason_code IS 'Código de razón: EXACT_MATCH, MULTIPLE_MATCHES, NO_MATCH, INVALID_IDENTIFIER, etc';

-- 6) Vista agregada para resumen por motivo
CREATE OR REPLACE VIEW matcher_results_summary AS
SELECT 
  run_id,
  account_id,
  outcome,
  reason_code,
  COUNT(*) as count
FROM matcher_results
GROUP BY run_id, account_id, outcome, reason_code;

COMMENT ON VIEW matcher_results_summary IS 'Resumen agregado de resultados por outcome y reason_code';
