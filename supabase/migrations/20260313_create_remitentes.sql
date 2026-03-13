-- Tabla de remitentes (orígenes de envío) para la sección Envíos
-- Permite guardar múltiples remitentes y marcar uno por defecto

CREATE TABLE IF NOT EXISTS remitentes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  direccion   TEXT NOT NULL,
  localidad   TEXT NOT NULL,
  provincia   TEXT NOT NULL,
  cp          TEXT NOT NULL,
  telefono    TEXT,
  email       TEXT,
  es_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remitentes_default ON remitentes(es_default) WHERE es_default = true;

-- Trigger para updated_at
CREATE TRIGGER update_remitentes_updated_at
  BEFORE UPDATE ON remitentes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
