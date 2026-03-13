-- Insertar Cabify Logistics como transportista disponible
-- Para activarlo: configurar credentials.api_key en el panel de transportistas
-- Documentación API: https://developers.cabify.com/reference/logistics-introduction

INSERT INTO carriers (name, slug, description, active, config)
VALUES (
  'Cabify Logistics',
  'cabify',
  'Servicio de logística de última milla de Cabify. Cobertura en CABA, GBA y Córdoba. Express, same-day y next-day.',
  false,
  '{"base_url": "https://api.cabify.com", "timeout_ms": 15000}'
)
ON CONFLICT (slug) DO NOTHING;
