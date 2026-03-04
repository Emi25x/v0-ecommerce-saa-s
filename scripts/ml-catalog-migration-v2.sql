-- ml_catalog_migration_jobs
-- Trackea el estado completo de un job de auditoría/migración para una cuenta
CREATE TABLE IF NOT EXISTS ml_catalog_migration_jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'idle'
                          CHECK (status IN ('idle','running','completed','failed','canceled')),
  phase                 text NOT NULL DEFAULT 'audit'
                          CHECK (phase IN ('audit','resolve_catalog_product','migrate')),
  -- totales
  total_estimated       int DEFAULT 0,
  processed_count       int DEFAULT 0,
  already_catalog_count int DEFAULT 0,
  no_ean_count          int DEFAULT 0,
  candidates_count      int DEFAULT 0,
  resolved_count        int DEFAULT 0,
  migrated_count        int DEFAULT 0,
  -- estado interno
  last_error            text,
  last_heartbeat_at     timestamptz,
  cursor                jsonb DEFAULT '{}',   -- paging_token / offset para resume
  dry_run               boolean DEFAULT true,
  -- timestamps
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ml_catalog_migration_jobs_account_idx
  ON ml_catalog_migration_jobs (account_id, status);

-- ml_catalog_migration_items
-- Un registro por publicación procesada, sin guardar payloads completos
CREATE TABLE IF NOT EXISTS ml_catalog_migration_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES ml_catalog_migration_jobs(id) ON DELETE CASCADE,
  account_id          uuid NOT NULL,
  item_id             text NOT NULL,
  ean                 text,
  is_catalog          boolean DEFAULT false,
  is_candidate        boolean DEFAULT false,
  catalog_product_id  text,
  resolve_status      text NOT NULL DEFAULT 'pending'
                        CHECK (resolve_status IN ('pending','resolved','not_found','ambiguous','error')),
  migrate_status      text NOT NULL DEFAULT 'pending'
                        CHECK (migrate_status IN ('pending','migrated','skipped','error')),
  error               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ml_catalog_migration_items_job_item_uq
  ON ml_catalog_migration_items (job_id, item_id);

CREATE INDEX IF NOT EXISTS ml_catalog_migration_items_account_item_idx
  ON ml_catalog_migration_items (account_id, item_id);

CREATE INDEX IF NOT EXISTS ml_catalog_migration_items_account_ean_idx
  ON ml_catalog_migration_items (account_id, ean)
  WHERE ean IS NOT NULL;

CREATE INDEX IF NOT EXISTS ml_catalog_migration_items_resolve_idx
  ON ml_catalog_migration_items (job_id, resolve_status);

CREATE INDEX IF NOT EXISTS ml_catalog_migration_items_migrate_idx
  ON ml_catalog_migration_items (job_id, migrate_status);

-- Trigger updated_at para ambas tablas
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ml_catalog_migration_jobs_updated_at') THEN
    CREATE TRIGGER ml_catalog_migration_jobs_updated_at
      BEFORE UPDATE ON ml_catalog_migration_jobs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ml_catalog_migration_items_updated_at') THEN
    CREATE TRIGGER ml_catalog_migration_items_updated_at
      BEFORE UPDATE ON ml_catalog_migration_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
