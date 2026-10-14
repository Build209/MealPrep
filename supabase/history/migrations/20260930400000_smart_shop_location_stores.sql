-- Smart Shop: home location on profile + saved favorite stores (idempotent)

alter table public.profiles
  add column if not exists home_zip text,
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision,
  add column if not exists home_location_updated_at timestamptz;

comment on column public.profiles.home_zip is 'User home ZIP for store search fallback';
comment on column public.profiles.home_lat is 'Last saved latitude (device or geocoded ZIP)';
comment on column public.profiles.home_lng is 'Last saved longitude';

create table if not exists public.user_favorite_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  store_key text not null,
  name text not null,
  chain text not null default '',
  address_line text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  lat double precision,
  lng double precision,
  kroger_location_id text,
  source text not null default 'osm',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, store_key)
);

create index if not exists user_favorite_stores_user_id_idx on public.user_favorite_stores (user_id);

alter table public.user_favorite_stores enable row level security;

drop policy if exists user_favorite_stores_owner on public.user_favorite_stores;
create policy user_favorite_stores_owner on public.user_favorite_stores
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_favorite_stores_admin_read on public.user_favorite_stores;
create policy user_favorite_stores_admin_read on public.user_favorite_stores
  for select using (public.is_admin());
