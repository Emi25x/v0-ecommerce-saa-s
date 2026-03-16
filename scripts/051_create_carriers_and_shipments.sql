-- ============================================================
-- Módulo de Envíos: tabla carriers + shipments
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. Tabla de transportistas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carriers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT false,
  config      JSONB NOT NULL DEFAULT '{}',       -- base_url, timeout_ms, etc.
  credentials JSONB NOT NULL DEFAULT '{}',       -- uuid/secret (Cabify) | user/password/token
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Tabla de envíos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id      UUID REFERENCES carriers(id),
  carrier_slug    TEXT NOT NULL,
  external_id     TEXT,                          -- ID del envío en el transportista
  tracking_number TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  -- pending | in_transit | delivered | failed | returned
  origin          JSONB,                         -- dirección remitente
  destination     JSONB,                         -- dirección destinatario
  items           JSONB,
  weight_g        INTEGER,
  declared_value  NUMERIC(12,2),
  cost            NUMERIC(12,2),
  label_url       TEXT,
  tracking_url    TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS shipments_carrier_slug_idx   ON shipments (carrier_slug);
CREATE INDEX IF NOT EXISTS shipments_tracking_number_idx ON shipments (tracking_number);
CREATE INDEX IF NOT EXISTS shipments_status_idx          ON shipments (status);
CREATE INDEX IF NOT EXISTS shipments_created_at_idx      ON shipments (created_at DESC);

-- ── 4. Trigger updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS carriers_updated_at  ON carriers;
DROP TRIGGER IF EXISTS shipments_updated_at ON shipments;

CREATE TRIGGER carriers_updated_at
  BEFORE UPDATE ON carriers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 5. Datos iniciales: FastMail ──────────────────────────────────────────────
INSERT INTO carriers (name, slug, description, active, config, credentials)
VALUES (
  'FastMail',
  'fastmail',
  'Correo tradicional — envíos por código postal. Activar con usuario y contraseña de la cuenta FastMail.',
  false,
  '{"base_url": "https://api.fastmail.com.ar", "timeout_ms": 15000}',
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

-- ── 6. Datos iniciales: Cabify Logistics ─────────────────────────────────────
INSERT INTO carriers (name, slug, description, active, config, credentials)
VALUES (
  'Cabify Logistics',
  'cabify',
  'Envíos express y programados en CABA, GBA y Córdoba. Activar con UUID + Secreto desde Cabify Logistics → Configuración → API.',
  false,
  '{"base_url": "https://api.cabify.com", "timeout_ms": 15000}',
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

-- ── 7. Verificación ───────────────────────────────────────────────────────────
SELECT id, name, slug, active FROM carriers ORDER BY name;
