-- ─────────────────────────────────────────────────────────────────────────────
-- 049_ml_publications_sold_qty_and_fk.sql
--
-- 1. Agrega columna sold_quantity a ml_publications (si no existe)
--    Necesaria para "Volver a pedir" ordenado por más vendidos.
--
-- 2. Agrega FK constraint ml_publications.product_id → products(id)
--    Necesaria para que PostgREST pueda resolver el join embebido.
--    Era solo un índice, sin constraint formal.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. sold_quantity
ALTER TABLE ml_publications
  ADD COLUMN IF NOT EXISTS sold_quantity INTEGER DEFAULT 0;

COMMENT ON COLUMN ml_publications.sold_quantity IS
  'Unidades vendidas acumuladas, sincronizadas desde ML en cada import.';

CREATE INDEX IF NOT EXISTS idx_ml_publications_sold_qty
  ON ml_publications (sold_quantity DESC NULLS LAST);

-- 2. FK product_id → products (solo si no existe ya)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_name      = 'ml_publications'
       AND kcu.column_name    = 'product_id'
  ) THEN
    ALTER TABLE ml_publications
      ADD CONSTRAINT fk_ml_publications_product
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
  END IF;
END $$;
