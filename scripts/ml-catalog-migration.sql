-- ml_catalog_jobs: un job de migración tradicional → catálogo por cuenta
CREATE TABLE IF NOT EXISTS ml_catalog_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','completed','failed')),
  mode            text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run','live')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  total_target    int NOT NULL DEFAULT 0,
  processed       int NOT NULL DEFAULT 0,
  success         int NOT NULL DEFAULT 0,
  failed          int NOT NULL DEFAULT 0,
  last_error      text
);

CREATE INDEX IF NOT EXISTS ml_catalog_jobs_account_idx ON ml_catalog_jobs(account_id);
CREATE INDEX IF NOT EXISTS ml_catalog_jobs_status_idx  ON ml_catalog_jobs(status);

-- ml_catalog_job_items: un item por publicación procesada
CREATE TABLE IF NOT EXISTS ml_catalog_job_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES ml_catalog_jobs(id) ON DELETE CASCADE,
  old_item_id         text NOT NULL,
  ean                 text,
  catalog_product_id  text,
  action              text CHECK (action IN ('create_new_catalog_item','skip_no_match','skip_ambiguous','skip_already_catalog','skip_no_ean')),
  new_item_id         text,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed','skipped')),
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ml_catalog_job_items_job_idx    ON ml_catalog_job_items(job_id);
CREATE INDEX IF NOT EXISTS ml_catalog_job_items_status_idx ON ml_catalog_job_items(status);
CREATE INDEX IF NOT EXISTS ml_catalog_job_items_item_idx   ON ml_catalog_job_items(old_item_id);
