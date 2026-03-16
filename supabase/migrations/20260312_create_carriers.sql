-- Tabla de transportistas/carriers para la sección Envíos
CREATE TABLE IF NOT EXISTS carriers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url    TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}',   -- configuración pública (base_url, timeouts, etc.)
  credentials JSONB NOT NULL DEFAULT '{}',   -- credenciales (api_key, user, password) — proteger con RLS
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carriers_slug   ON carriers(slug);
CREATE INDEX IF NOT EXISTS idx_carriers_active ON carriers(active) WHERE active = true;

-- Trigger para updated_at
CREATE TRIGGER update_carriers_updated_at
  BEFORE UPDATE ON carriers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tabla de envíos propios (independiente de ML)
CREATE TABLE IF NOT EXISTS shipments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id      UUID REFERENCES carriers(id) ON DELETE SET NULL,
  carrier_slug    TEXT,                            -- redundante para queries rápidas
  external_id     TEXT,                            -- ID del envío en el sistema del carrier
  tracking_number TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending, in_transit, delivered, failed, returned
  origin          JSONB,                           -- {name, address, city, province, zip, phone}
  destination     JSONB,                           -- {name, address, city, province, zip, phone}
  items           JSONB,                           -- [{sku, title, qty, weight_g}]
  weight_g        INTEGER,
  dimensions      JSONB,                           -- {length_cm, width_cm, height_cm}
  declared_value  NUMERIC(12,2),
  cost            NUMERIC(12,2),
  label_url       TEXT,
  tracking_url    TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_carrier_id      ON shipments(carrier_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number) WHERE tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_status          ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_external_id     ON shipments(carrier_slug, external_id) WHERE external_id IS NOT NULL;

CREATE TRIGGER update_shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Historial de estados del envío
CREATE TABLE IF NOT EXISTS shipment_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  description TEXT,
  location    TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw         JSONB                               -- respuesta cruda del carrier
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_id ON shipment_events(shipment_id);

-- Insertar FastMail como primer carrier (inactivo hasta configurar credenciales)
INSERT INTO carriers (name, slug, description, active, config)
VALUES (
  'Fast Mail',
  'fastmail',
  'Operador logístico argentino con cobertura nacional. API v2.',
  false,
  '{"base_url": "https://epresislv.fastmail.com.ar", "api_version": "v2", "timeout_ms": 15000}'
)
ON CONFLICT (slug) DO NOTHING;
