-- Agrega constraint UNIQUE (account_id, order_id) a ml_invoices_uploads
-- Necesaria para que el upsert en /api/billing/ml-upload-invoice funcione correctamente.
--
-- Si existen filas duplicadas para la misma (account_id, order_id), primero las limpia
-- conservando la más reciente.

-- 1. Eliminar duplicados (conservar el registro más reciente por account_id + order_id)
DELETE FROM ml_invoices_uploads
WHERE id NOT IN (
  SELECT DISTINCT ON (account_id, order_id) id
  FROM ml_invoices_uploads
  ORDER BY account_id, order_id, updated_at DESC
);

-- 2. Agregar la constraint única
ALTER TABLE ml_invoices_uploads
  ADD CONSTRAINT ml_invoices_uploads_account_order_unique
  UNIQUE (account_id, order_id);
