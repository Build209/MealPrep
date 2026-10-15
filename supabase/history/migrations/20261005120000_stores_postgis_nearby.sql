-- US grocery store catalog for Stores tab (PostGIS nearby search).
-- Data loaded via mobile/scripts/stores-ingest/ (Overture Places).

create extension if not exists postgis with schema extensions;

create table if not exists public.stores (
  id text primary key,
  name text not null,
  brand text,
  category text,
  address_line text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  lat double precision not null,
  lng double precision not null,
  geom extensions.geography (point, 4326) not null,
  phone text,
  website text,
  opening_hours text,
  sources text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists stores_geom_gist_idx on public.stores using gist (geom);

alter table public.stores enable row level security;

drop policy if exists stores_public_read on public.stores;
create policy stores_public_read on public.stores
  for select
  using (true);

comment on table public.stores is 'Grocery / big-box store locations (Overture + optional OSM ingest).';

create or replace function public.nearby_stores (
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 24000,
  p_limit int default 40
)
returns table (
  id text,
  name text,
  brand text,
  category text,
  address_line text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  opening_hours text,
  sources text[],
  distance_m double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select
    s.id,
    s.name,
    s.brand,
    s.category,
    s.address_line,
    s.city,
    s.state,
    s.zip,
    s.lat,
    s.lng,
    s.phone,
    s.website,
    s.opening_hours,
    s.sources,
    extensions.st_distance(s.geom, origin.g) as distance_m
  from public.stores s, origin
  where extensions.st_dwithin(s.geom, origin.g, p_radius_m)
  order by s.geom operator (extensions.<->) origin.g
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.nearby_stores(double precision, double precision, int, int) from public;
grant execute on function public.nearby_stores(double precision, double precision, int, int) to anon, authenticated;
