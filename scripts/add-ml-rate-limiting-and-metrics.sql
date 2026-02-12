-- Migración: Rate limiting multi-cuenta y métricas detalladas de importación
-- Objetivo: Soportar múltiples cuentas con 40-50k publicaciones sin rate limits

-- 1) Tabla de rate limiting (token bucket por cuenta)
CREATE TABLE IF NOT EXISTS ml_rate_limits (
  account_id uuid PRIMARY KEY REFERENCES ml_accounts(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT NOW(),
  tokens_used integer NOT NULL DEFAULT 0,
  tokens_limit integer NOT NULL DEFAULT 300, -- requests por minuto
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_rate_limits_window 
  ON ml_rate_limits(window_start) 
  WHERE tokens_used > 0;

COMMENT ON TABLE ml_rate_limits IS 'Token bucket para rate limiting de MercadoLibre API por cuenta';
COMMENT ON COLUMN ml_rate_limits.window_start IS 'Inicio de la ventana de rate limiting (resetea cada minuto)';
COMMENT ON COLUMN ml_rate_limits.tokens_used IS 'Tokens/requests usados en la ventana actual';
COMMENT ON COLUMN ml_rate_limits.tokens_limit IS 'Límite de requests por minuto para esta cuenta';

-- 2) Extender ml_import_progress con métricas detalladas
ALTER TABLE ml_import_progress
  ADD COLUMN IF NOT EXISTS current_status_filter text, -- 'active', 'paused', 'closed', null (all)
  ADD COLUMN IF NOT EXISTS scroll_id text,
  ADD COLUMN IF NOT EXISTS discovered_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enqueued_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fetched_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upsert_new_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upsert_updated_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retries_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_build boolean DEFAULT false;

COMMENT ON COLUMN ml_import_progress.current_status_filter IS 'Status actual siendo indexado: active, paused, closed, o null para todos';
COMMENT ON COLUMN ml_import_progress.scroll_id IS 'Scroll ID de MercadoLibre para paginación con search_type=scan';
COMMENT ON COLUMN ml_import_progress.discovered_count IS 'Total de IDs de publicaciones descubiertos';
COMMENT ON COLUMN ml_import_progress.enqueued_count IS 'IDs encolados para fetch de detalles';
COMMENT ON COLUMN ml_import_progress.fetched_count IS 'Detalles fetched exitosamente de ML API';
COMMENT ON COLUMN ml_import_progress.upsert_new_count IS 'Publicaciones nuevas insertadas';
COMMENT ON COLUMN ml_import_progress.upsert_updated_count IS 'Publicaciones existentes actualizadas';
COMMENT ON COLUMN ml_import_progress.failed_count IS 'Items fallidos en esta corrida';
COMMENT ON COLUMN ml_import_progress.last_error_at IS 'Timestamp del último error';
COMMENT ON COLUMN ml_import_progress.request_count IS 'Total de requests HTTP a ML API';
COMMENT ON COLUMN ml_import_progress.retries_count IS 'Total de retries por rate limit/errores';
COMMENT ON COLUMN ml_import_progress.needs_build IS 'Flag para indicar que necesita product builder después del import';

-- 3) Índices para performance
CREATE INDEX IF NOT EXISTS idx_ml_import_progress_needs_build 
  ON ml_import_progress(needs_build) 
  WHERE needs_build = true;

CREATE INDEX IF NOT EXISTS idx_ml_import_progress_status_filter 
  ON ml_import_progress(current_status_filter, status);
