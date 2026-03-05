-- ml_order_billing_cache: cache de datos fiscales por orden ML
CREATE TABLE IF NOT EXISTS ml_order_billing_cache (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL,
  order_id              text NOT NULL,
  nombre                text,
  doc_tipo              text,
  doc_numero            text,
  condicion_iva         text,
  direccion             text,
  billing_info_missing  boolean NOT NULL DEFAULT false,
  raw                   jsonb,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_ml_order_billing_cache_account_order
  ON ml_order_billing_cache (account_id, order_id);

-- ml_invoices_uploads: estado de subida de facturas a ML
CREATE TABLE IF NOT EXISTS ml_invoices_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL,
  order_id        text NOT NULL,
  factura_id      uuid,
  invoice_number  text,
  invoice_date    text,
  total_amount    numeric,
  pdf_url         text,
  status          text NOT NULL DEFAULT 'pending', -- pending | uploaded | error
  ml_response     jsonb,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_invoices_uploads_order
  ON ml_invoices_uploads (account_id, order_id);
