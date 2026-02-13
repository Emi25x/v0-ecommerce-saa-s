-- Migración: Sistema de Proveedores y Catálogos (Azeta)
-- Crea las tablas necesarias para gestionar proveedores, catálogos y items

-- 1) Tabla de proveedores
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('distributor', 'publisher', 'wholesaler', 'other')),
  country VARCHAR(2),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  api_config JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_suppliers_code ON suppliers(code);
CREATE INDEX idx_suppliers_type ON suppliers(type);
CREATE INDEX idx_suppliers_is_active ON suppliers(is_active);

COMMENT ON TABLE suppliers IS 'Proveedores/distribuidores de productos (Azeta, etc.)';
COMMENT ON COLUMN suppliers.code IS 'Código único del proveedor (ej: AZETA, YENNY)';
COMMENT ON COLUMN suppliers.api_config IS 'Configuración de API/FTP para importación automática';

-- 2) Tabla de catálogos de proveedores
CREATE TABLE IF NOT EXISTS supplier_catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT,
  file_size_bytes BIGINT,
  file_format VARCHAR(50) CHECK (file_format IN ('csv', 'xlsx', 'xml', 'json')),
  imported_at TIMESTAMPTZ,
  import_status VARCHAR(50) CHECK (import_status IN ('pending', 'processing', 'completed', 'failed')),
  import_error TEXT,
  total_items INTEGER DEFAULT 0,
  matched_items INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplier_catalogs_supplier_id ON supplier_catalogs(supplier_id);
CREATE INDEX idx_supplier_catalogs_import_status ON supplier_catalogs(import_status);
CREATE INDEX idx_supplier_catalogs_imported_at ON supplier_catalogs(imported_at);

COMMENT ON TABLE supplier_catalogs IS 'Catálogos/listas de precios de proveedores';
COMMENT ON COLUMN supplier_catalogs.file_url IS 'URL del archivo CSV/XLSX subido a Vercel Blob';
COMMENT ON COLUMN supplier_catalogs.import_status IS 'Estado de la importación del catálogo';

-- 3) Tabla de items del catálogo
CREATE TABLE IF NOT EXISTS supplier_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES supplier_catalogs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Datos del proveedor
  supplier_sku VARCHAR(100),
  supplier_isbn VARCHAR(20),
  supplier_ean VARCHAR(20),
  title TEXT NOT NULL,
  author VARCHAR(500),
  publisher VARCHAR(255),
  price_original DECIMAL(10,2),
  price_discounted DECIMAL(10,2),
  stock_quantity INTEGER,
  stock_status VARCHAR(50),
  delivery_days INTEGER,
  
  -- Matching y vinculación
  matched_by VARCHAR(50),
  matched_at TIMESTAMPTZ,
  match_confidence DECIMAL(3,2),
  
  -- Metadata
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplier_catalog_items_catalog_id ON supplier_catalog_items(catalog_id);
CREATE INDEX idx_supplier_catalog_items_supplier_id ON supplier_catalog_items(supplier_id);
CREATE INDEX idx_supplier_catalog_items_product_id ON supplier_catalog_items(product_id);
CREATE INDEX idx_supplier_catalog_items_supplier_sku ON supplier_catalog_items(supplier_sku);
CREATE INDEX idx_supplier_catalog_items_supplier_isbn ON supplier_catalog_items(supplier_isbn);
CREATE INDEX idx_supplier_catalog_items_supplier_ean ON supplier_catalog_items(supplier_ean);
CREATE INDEX idx_supplier_catalog_items_matched_at ON supplier_catalog_items(matched_at);

COMMENT ON TABLE supplier_catalog_items IS 'Items individuales de catálogos de proveedores';
COMMENT ON COLUMN supplier_catalog_items.matched_by IS 'Método de vinculación: isbn, ean, sku, title_fuzzy';
COMMENT ON COLUMN supplier_catalog_items.match_confidence IS 'Confianza del match (0.0 a 1.0)';
COMMENT ON COLUMN supplier_catalog_items.raw_data IS 'Datos originales del CSV para auditoría';

-- 4) Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplier_catalogs_updated_at BEFORE UPDATE ON supplier_catalogs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplier_catalog_items_updated_at BEFORE UPDATE ON supplier_catalog_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5) Insertar proveedor Azeta por defecto
INSERT INTO suppliers (name, code, type, country, is_active)
VALUES ('Azeta Libros', 'AZETA', 'distributor', 'AR', true)
ON CONFLICT (code) DO NOTHING;
