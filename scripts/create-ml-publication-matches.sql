-- Tabla para almacenar matches manuales de publicaciones ML con productos
CREATE TABLE IF NOT EXISTS ml_publication_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  ml_item_id TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  matched_by TEXT NOT NULL DEFAULT 'manual' CHECK (matched_by IN ('auto', 'manual')),
  matched_value TEXT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_user_id UUID NULL,
  CONSTRAINT unique_account_item UNIQUE (account_id, ml_item_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ml_publication_matches_account ON ml_publication_matches(account_id);
CREATE INDEX IF NOT EXISTS idx_ml_publication_matches_product ON ml_publication_matches(product_id);
CREATE INDEX IF NOT EXISTS idx_ml_publication_matches_item ON ml_publication_matches(ml_item_id);

-- Comentarios
COMMENT ON TABLE ml_publication_matches IS 'Matches entre publicaciones ML y productos internos (manuales y automáticos)';
COMMENT ON COLUMN ml_publication_matches.matched_by IS 'Origen del match: auto (importación automática) o manual (UI)';
COMMENT ON COLUMN ml_publication_matches.matched_value IS 'Valor usado para el match (SKU, GTIN, etc)';
COMMENT ON COLUMN ml_publication_matches.matched_user_id IS 'ID del usuario que hizo el match manual (nullable si no hay auth)';
