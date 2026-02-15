-- Eliminar usuario existente si existe (para recrear correctamente)
DELETE FROM auth.users WHERE email = 'admin@libroide.com';

-- Crear usuario con la API correcta de Supabase
-- NOTA: Este script debe ejecutarse desde el Dashboard de Supabase o usar la función auth.admin_create_user
-- Si no funciona, usar: Authentication > Users > "Add User" en el dashboard

-- Insertar usuario con todos los campos requeridos por Supabase
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@libroide.com',
  crypt('Xxxxxxxx', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
) RETURNING id, email, email_confirmed_at;

-- Crear identidad asociada (requerido por Supabase Auth)
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  id,
  id::text,
  jsonb_build_object('sub', id::text, 'email', email),
  'email',
  NOW(),
  NOW(),
  NOW()
FROM auth.users 
WHERE email = 'admin@libroide.com';
