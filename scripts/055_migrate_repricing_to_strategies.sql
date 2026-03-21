-- ============================================================================
-- 055: Migrate repricing_config → ml_price_strategies (fuente de verdad única)
--
-- Copia configuraciones activas de repricing_config que no existan aún en
-- ml_price_strategies. Es idempotente: puede ejecutarse múltiples veces.
--
-- Después de verificar que la migración fue exitosa:
--   1. Remover /api/cron/reprice de vercel.json crons
--   2. Las tablas repricing_config y repricing_history se mantienen
--      como archivo histórico (read-only)
-- ============================================================================

BEGIN;

-- Migrar configs que existen en repricing_config pero no en ml_price_strategies
INSERT INTO ml_price_strategies (
  ml_item_id,
  account_id,
  enabled,
  strategy,
  min_price,
  max_price,
  -- legacy target_price → max_price (ya que el moderno usa max_price como techo)
  delta_amount,
  delta_pct,
  raise_step_amount,
  raise_step_pct,
  delay_seconds,
  -- Preserve state from legacy
  last_reprice_at,
  last_status,
  last_our_price,
  last_price_to_win,
  last_competitor_price,
  last_error,
  created_at,
  updated_at
)
SELECT
  rc.ml_item_id,
  rc.account_id,
  rc.enabled,
  COALESCE(rc.strategy, 'win_buybox'),
  rc.min_price,
  -- Use max_price if set, otherwise fall back to target_price
  COALESCE(rc.max_price, rc.target_price),
  NULL,  -- delta_amount (no legacy equivalent)
  NULL,  -- delta_pct
  NULL,  -- raise_step_amount
  NULL,  -- raise_step_pct
  3600,  -- delay_seconds (1 hour default, matches legacy cron schedule)
  rc.last_run_at,
  rc.last_status,
  rc.last_our_price,
  rc.last_price_to_win,
  rc.last_competitor_price,
  rc.last_error,
  rc.created_at,
  rc.updated_at
FROM repricing_config rc
WHERE NOT EXISTS (
  SELECT 1 FROM ml_price_strategies mps
  WHERE mps.ml_item_id = rc.ml_item_id
);

-- Report what was migrated
DO $$
DECLARE
  migrated_count int;
  already_count int;
  legacy_count int;
BEGIN
  SELECT count(*) INTO legacy_count FROM repricing_config;
  SELECT count(*) INTO already_count FROM ml_price_strategies;

  RAISE NOTICE '── Repricing Migration Report ──';
  RAISE NOTICE 'Legacy repricing_config rows: %', legacy_count;
  RAISE NOTICE 'ml_price_strategies rows (after migration): %', already_count;
  RAISE NOTICE 'Migration complete. The legacy cron /api/cron/reprice is now a no-op.';
  RAISE NOTICE 'Active cron: /api/cron/ml-reprice (reads from ml_price_strategies)';
END $$;

COMMIT;
