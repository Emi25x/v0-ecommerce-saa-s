-- ── Multi-empresa migration ────────────────────────────────────────────────

-- 1. Nombre corto/alias para el selector de empresa
ALTER TABLE arca_config ADD COLUMN IF NOT EXISTS nombre_empresa text;

-- 2. Columna empresa_id en facturas (FK a arca_config)
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES arca_config(id);

-- 3. Backfill: asignar empresa_id a facturas existentes usando user_id
UPDATE facturas f
SET empresa_id = (
  SELECT id FROM arca_config c
  WHERE c.user_id = f.user_id
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE f.empresa_id IS NULL;

-- 4. Índice para queries por empresa
CREATE INDEX IF NOT EXISTS facturas_empresa_id_idx ON facturas(empresa_id);

SELECT 'ok' AS status;
