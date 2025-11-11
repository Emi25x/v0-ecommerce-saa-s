-- Agregar columna products_skipped a la tabla import_history
ALTER TABLE import_history
ADD COLUMN IF NOT EXISTS products_skipped integer DEFAULT 0;

-- Comentario para documentar el campo
COMMENT ON COLUMN import_history.products_skipped IS 'Cantidad de productos que fueron saltados durante la importación';
