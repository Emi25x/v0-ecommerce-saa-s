-- Tabla para guardar fuentes de importación configuradas
CREATE TABLE IF NOT EXISTS import_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  url_template TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'query_params', -- query_params, basic_auth, bearer_token
  credentials JSONB NOT NULL, -- {username, password, etc} - encriptado en la app
  feed_type TEXT,
  column_mapping JSONB, -- mapeo de columnas CSV a campos de producto
  is_active BOOLEAN DEFAULT true,
  last_import_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla para historial de importaciones
CREATE TABLE IF NOT EXISTS import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES import_sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- success, error, partial
  products_imported INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  products_failed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_import_sources_active ON import_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_import_history_source ON import_history(source_id);
CREATE INDEX IF NOT EXISTS idx_import_history_started ON import_history(started_at DESC);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_import_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_import_sources_updated_at
  BEFORE UPDATE ON import_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_import_sources_updated_at();
