-- Crear bucket 'imports' en Supabase Storage para guardar CSV de importaciones PRO
-- Esto permite descargar el CSV una sola vez y procesarlo por chunks

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imports',
  'imports',
  false, -- privado, solo accesible con autenticación
  104857600, -- 100MB límite por archivo
  ARRAY['text/csv', 'text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acceso (permitir operaciones autenticadas)
-- Nota: usar DO block porque CREATE POLICY no soporta IF NOT EXISTS directamente
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow authenticated uploads to imports'
  ) THEN
    CREATE POLICY "Allow authenticated uploads to imports"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'imports');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow authenticated reads from imports'
  ) THEN
    CREATE POLICY "Allow authenticated reads from imports"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'imports');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow authenticated deletes from imports'
  ) THEN
    CREATE POLICY "Allow authenticated deletes from imports"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'imports');
  END IF;
END $$;

COMMENT ON TABLE storage.buckets IS 'Bucket imports: almacena CSV de importaciones PRO para procesamiento por chunks';
