-- Habilitar Row Level Security en la tabla products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Política para permitir SELECT (lectura) a todos
CREATE POLICY "Allow public read access to products"
ON products
FOR SELECT
USING (true);

-- Política para permitir INSERT (creación) a todos
CREATE POLICY "Allow public insert access to products"
ON products
FOR INSERT
WITH CHECK (true);

-- Política para permitir UPDATE (actualización) a todos
CREATE POLICY "Allow public update access to products"
ON products
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Política para permitir DELETE (eliminación) a todos
CREATE POLICY "Allow public delete access to products"
ON products
FOR DELETE
USING (true);
