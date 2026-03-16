-- El campo code en suppliers estaba limitado a varchar(2), lo que impide
-- códigos como "LIBRALARG". Se amplía a varchar(50).
ALTER TABLE suppliers
  ALTER COLUMN code TYPE varchar(50);
