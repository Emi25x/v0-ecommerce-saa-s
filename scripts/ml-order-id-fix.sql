-- Cambiar ml_order_id a text para consistencia con el route
-- (los IDs de ML son bigint pero se manejan como string en el sistema)
ALTER TABLE ml_order_facturas ALTER COLUMN ml_order_id TYPE text USING ml_order_id::text;

-- ml_account_id pasa a ser el uuid de la fila en ml_accounts (no el seller_id)
-- El nombre describe que es el FK a la tabla ml_accounts
ALTER TABLE ml_order_facturas DROP CONSTRAINT IF EXISTS ml_order_facturas_ml_order_id_ml_account_id_key;
ALTER TABLE ml_order_facturas ADD CONSTRAINT ml_order_facturas_order_account_unique UNIQUE (ml_order_id, ml_account_id);

SELECT 'ok' AS status;
