-- 1. Add display name to shopify_stores
ALTER TABLE public.shopify_stores
  ADD COLUMN IF NOT EXISTS name text;

UPDATE public.shopify_stores SET name = shop_domain WHERE name IS NULL;

-- 2. Create export templates table
CREATE TABLE IF NOT EXISTS public.shopify_export_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_store_id      uuid NOT NULL REFERENCES public.shopify_stores(id) ON DELETE CASCADE,
  template_columns_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  defaults_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shopify_store_id)
);

-- 3. RLS
ALTER TABLE public.shopify_export_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shopify_export_templates' AND policyname = 'template_owner'
  ) THEN
    CREATE POLICY "template_owner" ON public.shopify_export_templates
      FOR ALL
      USING (
        shopify_store_id IN (
          SELECT id FROM public.shopify_stores WHERE owner_user_id = auth.uid()
        )
      );
  END IF;
END $$;
