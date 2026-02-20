-- Agregar campo handling_days (días de disponibilidad) y price_profile_id a plantillas

ALTER TABLE ml_publication_templates
ADD COLUMN IF NOT EXISTS handling_days integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS price_profile_id uuid REFERENCES price_profiles(id) ON DELETE SET NULL;

-- Agregar índice para búsquedas por perfil
CREATE INDEX IF NOT EXISTS idx_ml_templates_price_profile ON ml_publication_templates(price_profile_id);

-- Comentarios
COMMENT ON COLUMN ml_publication_templates.handling_days IS 'Días de disponibilidad/preparación del envío (1-30 días)';
COMMENT ON COLUMN ml_publication_templates.price_profile_id IS 'Referencia al perfil de precio a usar (price_profiles table)';
