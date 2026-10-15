-- Recreate nearby_stores as SECURITY INVOKER (table is public-read via RLS).

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
