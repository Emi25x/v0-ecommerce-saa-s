-- ============================================================
-- 028 - Tabla unificada de repricing
-- Reemplaza: price_tracking, price_tracking_history (inconsistentes)
--            competition_tracking, competition_snapshots (legacy sin uso)
-- ============================================================

-- Config de repricing por publicación ML
CREATE TABLE IF NOT EXISTS repricing_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_item_id      TEXT NOT NULL UNIQUE,          -- ej. MLA1234567890
  account_id      UUID REFERENCES ml_accounts(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT false,

  -- Límites de precio
  min_price       NUMERIC(10,2) NOT NULL,        -- nunca bajar de aquí
  max_price       NUMERIC(10,2),                 -- nunca subir de aquí (techo rentable)
  target_price    NUMERIC(10,2),                 -- precio objetivo cuando estoy solo / sin stock

  -- Estado del último ciclo (desnormalizado para UI rápida)
  last_run_at              TIMESTAMPTZ,
  last_status              TEXT,                 -- 'adjusted'|'below_min'|'at_ceiling'|'alone'|'competitor_no_stock'|'winning'|'error'
  last_our_price           NUMERIC(10,2),
  last_competitor_price    NUMERIC(10,2),
  last_price_to_win        NUMERIC(10,2),
  last_error               TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repricing_config_ml_item   ON repricing_config(ml_item_id);
CREATE INDEX IF NOT EXISTS idx_repricing_config_account   ON repricing_config(account_id);
CREATE INDEX IF NOT EXISTS idx_repricing_config_enabled   ON repricing_config(enabled) WHERE enabled = true;

-- Historial de cada cambio de precio aplicado por el sistema
CREATE TABLE IF NOT EXISTS repricing_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ml_item_id     TEXT NOT NULL,
  old_price      NUMERIC(10,2),
  new_price      NUMERIC(10,2),
  price_to_win   NUMERIC(10,2),
  status         TEXT NOT NULL,    -- razón del cambio (los mismos valores que last_status)
  changed        BOOLEAN NOT NULL DEFAULT false,  -- true si se modificó el precio en ML
  raw_response   JSONB,            -- respuesta raw de price_to_win para debugging
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repricing_history_item_time ON repricing_history(ml_item_id, created_at DESC);

-- Migración de datos existentes desde price_tracking (si existe y tiene datos)
-- Ejecutar solo si price_tracking tiene la columna ml_id (script 027):
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_tracking' AND column_name = 'ml_id'
  ) THEN
    INSERT INTO repricing_config (ml_item_id, enabled, min_price, created_at, updated_at)
    SELECT ml_id, enabled, COALESCE(min_price, 0), created_at, updated_at
    FROM price_tracking
    ON CONFLICT (ml_item_id) DO NOTHING;
  END IF;
END $$;

COMMENT ON TABLE repricing_config  IS 'Config de repricing automático por ítem ML. Reemplaza price_tracking.';
COMMENT ON TABLE repricing_history IS 'Historial de cambios de precio aplicados por el cron de repricing.';
