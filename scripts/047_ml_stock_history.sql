-- ─────────────────────────────────────────────────────────────────────────────
-- 047_ml_stock_history.sql
-- Historial de cambios de stock de publicaciones de MercadoLibre.
-- Registra cada vez que se modifica el stock de una publicación:
--   - vía sync-stock manual
--   - vía bulk-update
--   - vía webhook de ML (ventas)
--   - vía cron de repricing
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ml_stock_history (
  id                   UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  ml_item_id           TEXT         NOT NULL,
  account_id           UUID         REFERENCES ml_accounts(id) ON DELETE SET NULL,
  old_quantity         INTEGER,                          -- NULL si no se conocía el stock anterior
  new_quantity         INTEGER      NOT NULL,
  changed_by_user_id   UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  source               TEXT         NOT NULL DEFAULT 'manual',
    -- valores: manual | bulk_update | webhook_sold | cron_reprice | import | sync_related
  notes                TEXT,                             -- info adicional (ej: orden de venta ML)
  created_at           TIMESTAMPTZ  DEFAULT now() NOT NULL
);

-- Índice principal: consulta historial de un item ordenado por fecha
CREATE INDEX IF NOT EXISTS idx_ml_stock_history_item_date
  ON ml_stock_history (ml_item_id, created_at DESC);

-- Índice por cuenta (para dashboard de actividad)
CREATE INDEX IF NOT EXISTS idx_ml_stock_history_account_date
  ON ml_stock_history (account_id, created_at DESC);

-- Índice por usuario (para auditoría de quién cambió qué)
CREATE INDEX IF NOT EXISTS idx_ml_stock_history_user
  ON ml_stock_history (changed_by_user_id, created_at DESC);

-- RLS: cada usuario solo ve el historial de sus propias cuentas ML
ALTER TABLE ml_stock_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can read ml_stock_history"
  ON ml_stock_history FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM ml_accounts WHERE user_id = auth.uid()
    )
  );

-- INSERT: permitir a usuarios autenticados Y a service role (webhooks/cron)
CREATE POLICY "owner can insert ml_stock_history"
  ON ml_stock_history FOR INSERT
  WITH CHECK (
    -- Usuario autenticado insertando en su propia cuenta
    account_id IN (
      SELECT id FROM ml_accounts WHERE user_id = auth.uid()
    )
    OR
    -- Sin sesión (service role, webhooks, cron jobs del servidor)
    auth.uid() IS NULL
  );

COMMENT ON TABLE ml_stock_history IS
  'Historial de cambios de stock de publicaciones ML. '
  'La API de ML no provee un endpoint de historial, por lo que lo registramos nosotros.';
