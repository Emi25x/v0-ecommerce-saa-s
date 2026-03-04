-- ML Jobs Queue
-- Cola simple de jobs para ejecutar tareas de ML sin timeouts ni dependencia de la UI

create table if not exists ml_jobs (
  id          uuid        primary key default gen_random_uuid(),
  account_id  text        not null,
  type        text        not null,   -- import_publications | build_products | match_products | catalog_optin | buybox_sync | price_update
  payload     jsonb       not null default '{}',
  status      text        not null default 'queued',   -- queued | running | success | error
  attempts    int         not null default 0,
  run_after   timestamptz not null default now(),
  locked_at   timestamptz,
  locked_by   text,
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ml_jobs_status_run_after  on ml_jobs (status, run_after);
create index if not exists ml_jobs_account_id_status on ml_jobs (account_id, status);

-- Trigger: mantener updated_at actualizado automáticamente
create or replace function ml_jobs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ml_jobs_updated_at on ml_jobs;
create trigger ml_jobs_updated_at
  before update on ml_jobs
  for each row execute function ml_jobs_set_updated_at();

-- Logs opcionales por job
create table if not exists ml_job_logs (
  id         uuid        primary key default gen_random_uuid(),
  job_id     uuid        references ml_jobs(id) on delete cascade,
  level      text,       -- info | warn | error
  message    text,
  meta       jsonb,
  created_at timestamptz default now()
);

create index if not exists ml_job_logs_job_id on ml_job_logs (job_id);
