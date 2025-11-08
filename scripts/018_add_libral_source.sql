-- Agregar Libral como fuente de importación API

INSERT INTO import_sources (
  name,
  description,
  feed_type,
  url_template,
  auth_type,
  credentials,
  column_mapping,
  is_active,
  created_at,
  updated_at
)
VALUES (
  'Libral',
  'ERP Libral - Gestión de inventario y pedidos',
  'api',
  'https://libral.core.abazal.com/api/libroes/LibrosLIBRAL?db=LIBRAL',
  'jwt',
  jsonb_build_object(
    'auth_url', 'https://libral.core.abazal.com/api/auth/login?db=LIBRAL',
    'username_env', 'LIBRAL_USERNAME',
    'password_env', 'LIBRAL_PASSWORD',
    'token_validity', '30 days'
  ),
  jsonb_build_object(
    'sku', 'ean',
    'title', 'titulo',
    'description', 'sinopsis',
    'price', 'precioventa',
    'stock', 'stockdisponibletotal',
    'brand', 'nombreeditorial',
    'category', 'nombrecoleccion',
    'image_url', 'urlfotografia',
    'condition', 'activo',
    'update_strategy', 'smart_merge',
    'update_fields', jsonb_build_array('stock', 'price', 'brand'),
    'preserve_fields', jsonb_build_array('title', 'description', 'image_url', 'category')
  ),
  true,
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  feed_type = EXCLUDED.feed_type,
  url_template = EXCLUDED.url_template,
  auth_type = EXCLUDED.auth_type,
  credentials = EXCLUDED.credentials,
  column_mapping = EXCLUDED.column_mapping,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Verificar que se insertó correctamente
SELECT 
  id,
  name,
  description,
  feed_type,
  auth_type,
  is_active,
  column_mapping->>'sku' as sku_mapping,
  column_mapping->>'update_strategy' as update_strategy,
  created_at
FROM import_sources
WHERE name = 'Libral';
