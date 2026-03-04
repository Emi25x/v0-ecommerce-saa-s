alter table shopify_stores
  add column if not exists api_key text,
  add column if not exists api_secret text,
  add column if not exists token_expires_at timestamp with time zone;
