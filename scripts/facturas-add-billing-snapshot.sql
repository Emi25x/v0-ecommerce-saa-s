ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS billing_info_snapshot jsonb;
