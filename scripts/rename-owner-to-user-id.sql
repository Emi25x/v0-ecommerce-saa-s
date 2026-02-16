-- Renombrar owner_id a user_id en ml_accounts para consistencia
-- Si owner_id no existe, esta query falla gracefully

ALTER TABLE ml_accounts 
RENAME COLUMN owner_id TO user_id;

-- Comentario: Si la columna ya se llama user_id, este script fallará pero no dañará nada
