-- Trusted food creators + cached YouTube recipe videos (metadata only).

create table if not exists public.recipe_creators (
  id uuid primary key default gen_random_uuid(),
  youtube_channel_id text not null unique,
  display_name text not null,
  handle text,
  channel_url text not null,
  avatar_url text,
  subscriber_count bigint not null default 0,
  total_views bigint not null default 0,
  avg_views bigint not null default 0,
  avg_likes bigint not null default 0,
  rank int,
  fit text not null default 'Medium',
  source text,
  enabled boolean not null default true,
  notes text,
  updated_at timestamptz not null default now(),
  constraint recipe_creators_source_check check (
    source is null or source in ('top25', 'below_cutoff', 'david_pick')
  )
);

create index if not exists recipe_creators_enabled_fit_subs_idx
  on public.recipe_creators (
    enabled,
    (case
      when fit ilike '%high%' then 1
      when fit ilike '%medium%' then 2
      else 3
    end),
    subscriber_count desc
  );

create index if not exists recipe_creators_enabled_rank_idx
  on public.recipe_creators (enabled, rank nulls last, display_name);

create table if not exists public.creator_videos (
  video_id text primary key,
  channel_id text not null references public.recipe_creators (youtube_channel_id) on delete cascade,
  title text not null,
  description_snippet text,
  thumbnail_url text not null,
  published_at timestamptz,
  view_count bigint not null default 0,
  like_count bigint not null default 0,
  duration_seconds int,
  is_short boolean not null default false,
  url text not null,
  fetched_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(description_snippet, '')
    )
  ) stored
);

create index if not exists creator_videos_channel_published_idx
  on public.creator_videos (channel_id, published_at desc nulls last);

create index if not exists creator_videos_published_views_idx
  on public.creator_videos (published_at desc nulls last, view_count desc);

create index if not exists creator_videos_search_vector_idx
  on public.creator_videos using gin (search_vector);

alter table public.recipe_creators enable row level security;
alter table public.creator_videos enable row level security;

drop policy if exists recipe_creators_public_read on public.recipe_creators;
create policy recipe_creators_public_read on public.recipe_creators
  for select using (enabled = true);

drop policy if exists creator_videos_public_read on public.creator_videos;
create policy creator_videos_public_read on public.creator_videos
  for select using (
    exists (
      select 1
      from public.recipe_creators c
      where c.youtube_channel_id = creator_videos.channel_id
        and c.enabled = true
    )
  );

-- Service-role search helper (rate-limited at the edge function).

create or replace function public.search_creator_videos(p_query text, p_limit int default 40)
returns setof public.creator_videos
language sql
stable
security definer
set search_path = public
as $$
  select v.*
  from public.creator_videos v
  inner join public.recipe_creators c on c.youtube_channel_id = v.channel_id and c.enabled = true
  where length(trim(coalesce(p_query, ''))) >= 2
    and v.search_vector @@ plainto_tsquery('english', trim(p_query))
  order by ts_rank(v.search_vector, plainto_tsquery('english', trim(p_query))) desc,
           v.view_count desc
  limit greatest(1, least(coalesce(p_limit, 40), 60));
$$;

revoke all on function public.search_creator_videos(text, int) from public;
grant execute on function public.search_creator_videos(text, int) to service_role;
