-- Tabla de vinculación entre productos de nuestra DB y variantes de Shopify
-- Soporta múltiples tiendas (store_id) y múltiples variantes por producto
-- Igual al patrón ml_listings: product_id + account/store_id como clave compuesta

CREATE TABLE IF NOT EXISTS public.shopify_product_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referencia a nuestra base de productos
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,

  -- Referencia a la tienda Shopify (diferencia entre tienda AR y ES)
  store_id            uuid NOT NULL REFERENCES public.shopify_stores(id) ON DELETE CASCADE,

  -- IDs de Shopify para operar sobre el producto
  shopify_product_id  bigint NOT NULL,
  shopify_variant_id  bigint NOT NULL,

  -- Datos denormalizados de Shopify para mostrar sin hacer llamadas extra
  shopify_title       text,
  shopify_sku         text,
  shopify_barcode     text,
  shopify_price       numeric,
  shopify_status      text,       -- active | draft | archived
  shopify_image_url   text,

  -- Cómo se estableció el vínculo
  matched_by          text NOT NULL DEFAULT 'ean',  -- 'ean' | 'isbn' | 'sku' | 'manual'
  matched_value       text,        -- el valor que matcheó (ej: "9788412807080")

  -- Estado del vínculo
  sync_status         text NOT NULL DEFAULT 'linked',  -- 'linked' | 'conflict' | 'unlinked'
  last_synced_at      timestamp with time zone,
  sync_error          text,

  created_at          timestamp with time zone DEFAULT now(),
  updated_at          timestamp with time zone DEFAULT now(),

  -- Un producto puede estar vinculado a una sola variante por tienda
  UNIQUE (product_id, store_id, shopify_variant_id)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_spl_product_id   ON public.shopify_product_links(product_id);
CREATE INDEX IF NOT EXISTS idx_spl_store_id     ON public.shopify_product_links(store_id);
CREATE INDEX IF NOT EXISTS idx_spl_variant_id   ON public.shopify_product_links(shopify_variant_id);
CREATE INDEX IF NOT EXISTS idx_spl_product_id_store ON public.shopify_product_links(product_id, store_id);

-- RLS: mismas políticas que shopify_stores (owner_user_id via join)
ALTER TABLE public.shopify_product_links ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo ven/modifican vínculos de sus propias tiendas
CREATE POLICY "Users can view own store links"
  ON public.shopify_product_links FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM public.shopify_stores WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own store links"
  ON public.shopify_product_links FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT id FROM public.shopify_stores WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own store links"
  ON public.shopify_product_links FOR UPDATE
  USING (
    store_id IN (
      SELECT id FROM public.shopify_stores WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own store links"
  ON public.shopify_product_links FOR DELETE
  USING (
    store_id IN (
      SELECT id FROM public.shopify_stores WHERE owner_user_id = auth.uid()
    )
  );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_spl_updated_at ON public.shopify_product_links;
CREATE TRIGGER trg_spl_updated_at
  BEFORE UPDATE ON public.shopify_product_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
