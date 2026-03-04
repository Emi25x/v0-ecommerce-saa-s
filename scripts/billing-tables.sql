-- ============================================================
-- ARCA Facturación Electrónica — Tablas
-- ============================================================

-- Configuración ARCA por usuario (CUIT, certificado, punto de venta)
CREATE TABLE IF NOT EXISTS arca_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cuit              text NOT NULL,
  razon_social      text NOT NULL,
  domicilio_fiscal  text,
  punto_venta       int  NOT NULL DEFAULT 1,
  condicion_iva     text NOT NULL DEFAULT 'responsable_inscripto', -- responsable_inscripto | monotributo | exento
  ambiente          text NOT NULL DEFAULT 'homologacion',           -- homologacion | produccion
  cert_pem          text,        -- certificado X.509 en PEM
  private_key_pem   text,        -- clave privada RSA en PEM
  -- Token cacheado (válido 12hs)
  wsaa_token        text,
  wsaa_sign         text,
  wsaa_expires_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);

-- Facturas emitidas
CREATE TABLE IF NOT EXISTS facturas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  arca_config_id    uuid NOT NULL REFERENCES arca_config(id) ON DELETE RESTRICT,
  -- Numeración
  punto_venta       int  NOT NULL,
  tipo_comprobante  int  NOT NULL,  -- 1=FA 6=FB 11=FC 51=FM
  numero            bigint NOT NULL,
  -- CAE
  cae               text,
  cae_vto           date,
  -- Receptor
  receptor_tipo_doc int  NOT NULL DEFAULT 96, -- 96=DNI 80=CUIT 0=SinDocumento
  receptor_nro_doc  text,
  receptor_nombre   text NOT NULL,
  receptor_domicilio text,
  receptor_condicion_iva text NOT NULL DEFAULT 'consumidor_final',
  -- Montos
  moneda            text NOT NULL DEFAULT 'PES',
  subtotal          numeric(14,2) NOT NULL DEFAULT 0,
  iva_105           numeric(14,2) NOT NULL DEFAULT 0,
  iva_21            numeric(14,2) NOT NULL DEFAULT 0,
  iva_27            numeric(14,2) NOT NULL DEFAULT 0,
  total             numeric(14,2) NOT NULL DEFAULT 0,
  -- Items (JSONB)
  items             jsonb NOT NULL DEFAULT '[]',
  -- Estado
  estado            text NOT NULL DEFAULT 'pendiente', -- pendiente | emitida | error | anulada
  error_msg         text,
  -- Opcional: vínculo con pedido
  order_id          text,
  -- PDF
  pdf_url           text,
  -- Timestamps
  fecha_emision     date NOT NULL DEFAULT CURRENT_DATE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (arca_config_id, punto_venta, tipo_comprobante, numero)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_facturas_owner    ON facturas (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_facturas_estado   ON facturas (estado);
CREATE INDEX IF NOT EXISTS idx_facturas_cae      ON facturas (cae) WHERE cae IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arca_config_owner ON arca_config (owner_user_id);

-- RLS
ALTER TABLE arca_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arca_config_owner" ON arca_config;
CREATE POLICY "arca_config_owner" ON arca_config
  FOR ALL USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "facturas_owner" ON facturas;
CREATE POLICY "facturas_owner" ON facturas
  FOR ALL USING (owner_user_id = auth.uid());

-- Función updated_at automático
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS arca_config_updated_at ON arca_config;
CREATE TRIGGER arca_config_updated_at
  BEFORE UPDATE ON arca_config FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS facturas_updated_at ON facturas;
CREATE TRIGGER facturas_updated_at
  BEFORE UPDATE ON facturas FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
