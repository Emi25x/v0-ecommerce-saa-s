-- 046: Ajustes de exportación a Shopify por tienda
-- Agrega columnas de configuración a shopify_stores:
--   • vendor              → nombre del "Vendor" que aparece en Shopify (ej: "libroide argentina")
--   • product_category    → categoría de producto (ej: "Media > Books > Print Books")
--   • price_source        → de dónde tomar el precio: 'products.price' | 'product_prices'
--   • price_list_id       → lista de precios del motor de pricing (cuando price_source = 'product_prices')
--   • default_warehouse_id→ almacén predeterminado para tomar el stock
--   • sucursal_stock_code → código(s) de sucursal Shopify separados por ";" (metafield sucursal_stock)

ALTER TABLE shopify_stores
  ADD COLUMN IF NOT EXISTS vendor                TEXT,
  ADD COLUMN IF NOT EXISTS product_category      TEXT DEFAULT 'Media > Books > Print Books',
  ADD COLUMN IF NOT EXISTS price_source          TEXT NOT NULL DEFAULT 'products.price'
    CHECK (price_source IN ('products.price', 'product_prices')),
  ADD COLUMN IF NOT EXISTS price_list_id         UUID REFERENCES price_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_warehouse_id  UUID REFERENCES warehouses(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sucursal_stock_code   TEXT;

COMMENT ON COLUMN shopify_stores.vendor               IS 'Vendor que aparece en todos los productos de esta tienda Shopify';
COMMENT ON COLUMN shopify_stores.product_category     IS 'Product Category de Shopify (ej: Media > Books > Print Books)';
COMMENT ON COLUMN shopify_stores.price_source         IS 'Origen del precio: products.price o product_prices (motor de pricing)';
COMMENT ON COLUMN shopify_stores.price_list_id        IS 'Lista de precios del motor de pricing a usar cuando price_source=product_prices';
COMMENT ON COLUMN shopify_stores.default_warehouse_id IS 'Almacén predeterminado para stock de esta tienda';
COMMENT ON COLUMN shopify_stores.sucursal_stock_code  IS 'Código(s) de sucursal/location Shopify para el metafield sucursal_stock (ej: 5AJ;YFB)';
