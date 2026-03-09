-- ============================================================
-- 042 - Agregar campo strategy a repricing_config
-- ============================================================
-- Estrategias disponibles:
--   win_buybox            → usar price_to_win de ML para ganar el buybox
--   follow_competitor     → igualar el precio exacto del ganador actual
--   maximize_margin_if_alone → igual a win_buybox en competencia,
--                              sube directo a max_price cuando está solo
-- ============================================================

ALTER TABLE repricing_config
  ADD COLUMN IF NOT EXISTS strategy TEXT NOT NULL DEFAULT 'win_buybox';

COMMENT ON COLUMN repricing_config.strategy IS
  'Estrategia: win_buybox | follow_competitor | maximize_margin_if_alone';
