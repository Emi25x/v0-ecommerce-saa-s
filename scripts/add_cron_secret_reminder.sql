-- RECORDATORIO: Configurar CRON_SECRET en Vercel
-- 
-- 1. Ve a Vercel → Tu Proyecto → Settings → Environment Variables
-- 2. Agrega una nueva variable:
--    Nombre: CRON_SECRET
--    Valor: una-cadena-secreta-fuerte-aleatoria-123456
-- 3. Aplica a todos los entornos (Production, Preview, Development)
-- 4. Redeploy el proyecto
--
-- Los cronjobs de Vercel enviarán esta clave en el header Authorization
-- para autenticar las peticiones a los endpoints /api/cron/*

SELECT 'RECORDATORIO: Configurar CRON_SECRET en Vercel' AS mensaje;
