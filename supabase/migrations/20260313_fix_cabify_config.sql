-- Corrige la configuración del carrier Cabify Logistics:
--   - base_url: https://api.cabify.com → https://logistics.api.cabify.com
--   - auth_url: agrega endpoint OAuth 2.0

UPDATE carriers
SET config = jsonb_set(
              jsonb_set(
                config,
                '{base_url}',
                '"https://logistics.api.cabify.com"'
              ),
              '{auth_url}',
              '"https://cabify.com/auth/api/authorization"'
            )
WHERE slug = 'cabify';
