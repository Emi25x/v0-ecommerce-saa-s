-- 054: Add listing_type_id and thumbnail columns to ml_publications
-- These fields are fetched from ML API but were never persisted.

ALTER TABLE ml_publications
  ADD COLUMN IF NOT EXISTS listing_type_id TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- Relax weight constraint: allow items down to 1g (some small items like bookmarks, stickers)
-- The old constraint (50g-30kg) silently dropped lightweight items on upsert.
ALTER TABLE ml_publications DROP CONSTRAINT IF EXISTS ml_publications_weight_range_check;
ALTER TABLE ml_publications ADD CONSTRAINT ml_publications_weight_range_check
  CHECK (meli_weight_g IS NULL OR (meli_weight_g >= 1 AND meli_weight_g <= 30000));

COMMENT ON COLUMN ml_publications.listing_type_id IS 'ML listing type: gold_special, gold_pro, gold, silver, bronze, free';
COMMENT ON COLUMN ml_publications.thumbnail IS 'ML item thumbnail URL';
