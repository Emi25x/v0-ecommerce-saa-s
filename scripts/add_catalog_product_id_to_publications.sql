-- Add catalog_product_id to ml_publications for catalog eligibility tracking
ALTER TABLE public.ml_publications
  ADD COLUMN IF NOT EXISTS catalog_product_id text;

-- Index for quick lookup of publications that have a matched catalog product
CREATE INDEX IF NOT EXISTS idx_ml_publications_catalog_product_id
  ON public.ml_publications (catalog_product_id)
  WHERE catalog_product_id IS NOT NULL;
