-- Viral recipe link-out shelf (YouTube metadata only — no shared recipe text)

create table if not exists public.viral_recipes_cache_meta (
  id smallint primary key default 1 check (id = 1),
  refreshed_at timestamptz not null default '1970-01-01'::timestamptz,
  refreshing_until timestamptz,
  refresh_backoff_until timestamptz
);

insert into public.viral_recipes_cache_meta (id, refreshed_at)
values (1, '1970-01-01'::timestamptz)
on conflict (id) do nothing;

create table if not exists public.viral_recipe_links (
  category text not null check (category in ('viral', 'quick', 'budget')),
  video_id text not null,
  title text not null,
  thumbnail_url text not null,
  channel_id text not null,
  channel_title text not null,
  channel_url text not null,
  watch_url text not null,
  view_count bigint not null default 0,
  published_at timestamptz,
  sort_rank int not null default 0,
  cached_at timestamptz not null default now(),
  primary key (category, video_id)
);

create index if not exists viral_recipe_links_category_rank_idx
  on public.viral_recipe_links (category, sort_rank);

alter table public.viral_recipes_cache_meta enable row level security;
alter table public.viral_recipe_links enable row level security;

drop policy if exists viral_recipes_cache_meta_read on public.viral_recipes_cache_meta;
create policy viral_recipes_cache_meta_read on public.viral_recipes_cache_meta
  for select using (true);

drop policy if exists viral_recipe_links_read on public.viral_recipe_links;
create policy viral_recipe_links_read on public.viral_recipe_links
  for select using (true);

-- Refresh lock + completion (service role only — called from viral-recipes edge function)

create or replace function public.try_acquire_viral_recipes_refresh_lock(p_lock_minutes int default 2)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.viral_recipes_cache_meta
  set refreshing_until = now() + make_interval(mins => p_lock_minutes)
  where id = 1
    and (refreshing_until is null or refreshing_until < now())
    and (refresh_backoff_until is null or refresh_backoff_until < now());

  return found;
end;
$$;

create or replace function public.release_viral_recipes_refresh_lock()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.viral_recipes_cache_meta
  set refreshing_until = null
  where id = 1;
end;
$$;

create or replace function public.complete_viral_recipes_refresh_success()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.viral_recipes_cache_meta
  set
    refreshed_at = now(),
    refreshing_until = null,
    refresh_backoff_until = null
  where id = 1;
end;
$$;

create or replace function public.complete_viral_recipes_refresh_failure(p_backoff_hours int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.viral_recipes_cache_meta
  set
    refreshing_until = null,
    refresh_backoff_until = now() + make_interval(hours => p_backoff_hours)
  where id = 1;
end;
$$;

revoke all on function public.try_acquire_viral_recipes_refresh_lock(int) from public;
revoke all on function public.release_viral_recipes_refresh_lock() from public;
revoke all on function public.complete_viral_recipes_refresh_success() from public;
revoke all on function public.complete_viral_recipes_refresh_failure(int) from public;

grant execute on function public.try_acquire_viral_recipes_refresh_lock(int) to service_role;
grant execute on function public.release_viral_recipes_refresh_lock() to service_role;
grant execute on function public.complete_viral_recipes_refresh_success() to service_role;
grant execute on function public.complete_viral_recipes_refresh_failure(int) to service_role;
