-- Eliminar el índice único existente en ml_item_id solo
DROP INDEX IF EXISTS idx_ml_publications_item_id;

-- Crear índice único compuesto (account_id, ml_item_id)
-- para soportar múltiples cuentas con el mismo ml_item_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_publications_account_item 
  ON ml_publications(account_id, ml_item_id);

-- Comentario explicativo
COMMENT ON INDEX idx_ml_publications_account_item IS 
  'Unique constraint para permitir múltiples cuentas con el mismo ml_item_id';
