-- Función RPC atómica para manual match
CREATE OR REPLACE FUNCTION manual_match_publication(
  p_account_id uuid,
  p_ml_item_id text,
  p_product_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Validar que la publicación existe
  IF NOT EXISTS (
    SELECT 1 FROM ml_publications 
    WHERE account_id = p_account_id AND ml_item_id = p_ml_item_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Publicación no encontrada'
    );
  END IF;

  -- Validar que el producto existe
  IF NOT EXISTS (
    SELECT 1 FROM products WHERE id = p_product_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Producto no encontrado'
    );
  END IF;

  -- Insertar/actualizar match en ml_publication_matches
  INSERT INTO ml_publication_matches (
    account_id,
    ml_item_id,
    product_id,
    matched_by,
    matched_at,
    matched_by_user_id
  ) VALUES (
    p_account_id,
    p_ml_item_id,
    p_product_id,
    'manual',
    NOW(),
    p_user_id
  )
  ON CONFLICT (account_id, ml_item_id) 
  DO UPDATE SET
    product_id = EXCLUDED.product_id,
    matched_by = 'manual',
    matched_at = NOW(),
    matched_by_user_id = COALESCE(EXCLUDED.matched_by_user_id, ml_publication_matches.matched_by_user_id);

  -- Actualizar ml_publications
  UPDATE ml_publications
  SET 
    product_id = p_product_id,
    matched_by = 'manual',
    updated_at = NOW()
  WHERE account_id = p_account_id AND ml_item_id = p_ml_item_id;

  -- Retornar éxito
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Match creado correctamente'
  );
END;
$$ LANGUAGE plpgsql;

-- Índices para performance de queries unmatched
-- Índice en ml_publication_matches para LEFT JOIN rápido
CREATE INDEX IF NOT EXISTS idx_ml_publication_matches_lookup 
  ON ml_publication_matches(account_id, ml_item_id);

-- Índice en ml_publications para filtros comunes
CREATE INDEX IF NOT EXISTS idx_ml_publications_unmatched 
  ON ml_publications(account_id, product_id)
  WHERE product_id IS NULL;

-- Índice para búsqueda por título/ml_item_id
CREATE INDEX IF NOT EXISTS idx_ml_publications_search 
  ON ml_publications USING gin(to_tsvector('spanish', title));
