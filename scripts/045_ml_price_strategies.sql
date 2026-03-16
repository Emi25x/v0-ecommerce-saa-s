-- ============================================================
-- 045 - Sistema de repricing profesional para MercadoLibre
--
-- Nuevas tablas (no reemplaza repricing_config — coexisten):
--   ml_price_strategies  → config por ítem, 5 estrategias
--   ml_repricing_jobs    → cola de jobs con estado
--
-- Legacy (NO usar en código nuevo):
--   competition_tracking  / competition_snapshots  → script 025, sin uso
--   price_tracking                                 → migrado en script 028
-- ============================================================

-- ── 1. Estrategias de precio por publicación ─────────────────────────────────

CREATE TABLE IF NOT EXISTS ml_price_strategies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  ml_item_id          TEXT NOT NULL,
  product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
  enabled             BOOLEAN NOT NULL DEFAULT false,

  -- Estrategia
  strategy            TEXT NOT NULL DEFAULT 'win_buybox'
    CHECK (strategy IN (
      'win_buybox',              -- usar price_to_win de ML
      'follow_competitor',       -- igualar precio exacto del ganador
      'maximize_margin_if_alone',-- win_buybox con competidor; max_price cuando solo
      'cost_plus',               -- costo × (1 + margen) como piso; win_buybox como techo
      'hybrid'                   -- follow_competitor + subida gradual cuando solo
    )),

  -- Límites obligatorios
  min_price           NUMERIC(10,2) NOT NULL,
  max_price           NUMERIC(10,2),

  -- Ajuste vs competidor (opcional, ej: -1 ARS o -0.5 % para subcotizar levemente)
  delta_amount        NUMERIC(10,2),   -- offset fijo sobre precio objetivo
  delta_pct           NUMERIC(5,2),    -- offset % sobre precio objetivo

  -- Solo cost_plus / hybrid
  target_margin_pct   NUMERIC(5,2),    -- margen mínimo sobre costo (ej: 30 = 30%)

  -- Subida gradual cuando estamos solos (sin competidor con stock)
  raise_step_amount   NUMERIC(10,2),   -- subir X ARS por ciclo; NULL = saltar a max
  raise_step_pct      NUMERIC(5,2),    -- subir X% del precio actual por ciclo

  -- Fuente de competencia
  use_price_to_win    BOOLEAN NOT NULL DEFAULT true,  -- usar API de ML

  -- Cooldown: no repricear este ítem más frecuente que esto
  delay_seconds       INTEGER NOT NULL DEFAULT 3600,

  -- Estado desnormalizado del último ciclo (para UI rápida)
  last_reprice_at     TIMESTAMPTZ,
  last_status         TEXT,
    -- 'adjusted' | 'below_min' | 'at_ceiling' | 'alone' | 'competitor_no_stock'
    -- 'winning' | 'no_change' | 'cooldown' | 'error'
  last_our_price      NUMERIC(10,2),
  last_competitor_price NUMERIC(10,2),
  last_price_to_win   NUMERIC(10,2),
  last_error          TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (account_id, ml_item_id)
);

CREATE INDEX IF NOT EXISTS idx_mps_enabled   ON ml_price_strategies(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_mps_account   ON ml_price_strategies(account_id);
CREATE INDEX IF NOT EXISTS idx_mps_item      ON ml_price_strategies(ml_item_id);
CREATE INDEX IF NOT EXISTS idx_mps_next_run  ON ml_price_strategies(last_reprice_at NULLS FIRST) WHERE enabled = true;

-- ── 2. Jobs de repricing (cola con estado) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS ml_repricing_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id   UUID REFERENCES ml_price_strategies(id) ON DELETE SET NULL,
  account_id    UUID REFERENCES ml_accounts(id) ON DELETE CASCADE,
  ml_item_id    TEXT NOT NULL,
  old_price     NUMERIC(10,2),
  new_price     NUMERIC(10,2),
  reason        TEXT,
    -- 'win_buybox' | 'follow_competitor' | 'alone_raise' | 'competitor_no_stock'
    -- 'below_min' | 'at_ceiling' | 'no_change' | 'cooldown' | 'cost_floor' | 'error'
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','skipped','error')),
  error_message TEXT,
  triggered_by  TEXT DEFAULT 'cron',   -- 'cron' | 'manual'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  response_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_mrj_item_date  ON ml_repricing_jobs(ml_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrj_status     ON ml_repricing_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrj_account    ON ml_repricing_jobs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrj_strategy   ON ml_repricing_jobs(strategy_id);

COMMENT ON TABLE ml_price_strategies IS '5 estrategias de repricing por publicación ML. Coexiste con repricing_config (legacy).';
COMMENT ON TABLE ml_repricing_jobs   IS 'Cola de jobs de repricing con estado pending/processing/done/error.';
