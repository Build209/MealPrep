-- Link-imported recipes (YouTube / web) + shared URL cache for Gemini cost control.

alter table public.recipes
  add column if not exists source_url text,
  add column if not exists source_type text check (source_type is null or source_type in ('youtube', 'web')),
  add column if not exists source_title text,
  add column if not exists prep_minutes int,
  add column if not exists cook_minutes int;

create index if not exists recipes_created_by_source_url_idx
  on public.recipes (created_by, source_url)
  where source_url is not null;

create table if not exists public.recipe_import_cache (
  url_hash text primary key,
  source_url text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists recipe_import_cache_expires_idx
  on public.recipe_import_cache (expires_at);

alter table public.recipe_import_cache enable row level security;

-- No client policies: only service role (edge function) reads/writes cache.
