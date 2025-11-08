-- Crear tabla de destinos de publicación
CREATE TABLE IF NOT EXISTS publication_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'mercadolibre', 'shopify', 'custom'
  description TEXT,
  description_template TEXT, -- Plantilla con placeholders: "Marca: {marca}\nColor: {color}"
  field_mapping JSONB DEFAULT '{}', -- Mapeo de campos: {"title": "title", "price": "price", "marca": "brand"}
  default_values JSONB DEFAULT '{}', -- Valores por defecto: {"condition": "new", "listing_type_id": "gold_special"}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_publication_destinations_type ON publication_destinations(type);
CREATE INDEX IF NOT EXISTS idx_publication_destinations_active ON publication_destinations(is_active);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_publication_destinations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_publication_destinations_updated_at
  BEFORE UPDATE ON publication_destinations
  FOR EACH ROW
  EXECUTE FUNCTION update_publication_destinations_updated_at();

-- Insertar destinos por defecto
INSERT INTO publication_destinations (name, type, description, description_template, field_mapping, default_values)
VALUES 
  (
    'Mercado Libre',
    'mercadolibre',
    'Publicación en Mercado Libre Argentina',
    'Producto de alta calidad\n\nCaracterísticas:\n- Marca: {marca}\n- Modelo: {modelo}\n- Color: {color}',
    '{"title": "title", "price": "price", "stock": "available_quantity", "sku": "seller_custom_field", "images": "pictures"}',
    '{"condition": "new", "listing_type_id": "gold_special", "currency_id": "ARS", "buying_mode": "buy_it_now"}'
  ),
  (
    'Shopify',
    'shopify',
    'Publicación en tienda Shopify',
    '<p>Producto de alta calidad</p>\n<ul>\n<li>Marca: {marca}</li>\n<li>Modelo: {modelo}</li>\n<li>Color: {color}</li>\n</ul>',
    '{"title": "title", "price": "variants[0].price", "stock": "variants[0].inventory_quantity", "sku": "variants[0].sku"}',
    '{"status": "active", "published": true}'
  )
ON CONFLICT DO NOTHING;
