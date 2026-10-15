-- Per-minute rate limits for the AI and search edge functions, kept in the database.
--
-- NOT APPLIED TO LIVE. Owner approval needed before live. Local stacks (CI, `supabase start`)
-- run it.
--
-- Why: the launch audit found the per-minute limits on pantry-vision, recipe-import,
-- recipeapi-proxy and viral-recipes are kept in each function copy's memory. They reset whenever
-- a copy restarts and are not shared between copies, so a burst spread over several copies is not
-- stopped. This file adds one shared counter per (account, function, time window).
--
-- How it works:
--   - public.ai_rate_limits: one row per account, function name and window start, with a hit
--     count. Row level security on, no client policies, no anon/authenticated grants. Rows go when
--     the account is deleted (on delete cascade).
--   - public.take_rate_limit(p_fn, p_limit, p_window_seconds) returns boolean: true = go ahead,
--     false = over the limit for this window. It counts the caller from auth.uid() (the signed-in
--     session the edge function forwards), never from an id the caller passes. One statement
--     (insert ... on conflict do update ... where hits < limit ... returning), so two copies of a
--     function racing for the last slot cannot both get it. A refused call does not add a hit.
--   - Signed-in callers only: anon and PUBLIC cannot run it. Guests (signed out, using the
--     publishable key) are still limited in memory by the edge functions, by network address.
--   - p_fn must be one of the known function names and p_window_seconds one of 60, 3600 or 86400,
--     so a client calling it directly cannot fill the table with made-up keys. Adding a function
--     name later needs a new migration.
--
-- Cleanup: when a caller starts a new window, that caller's rows older than one day are deleted
-- (cheap: primary key starts with user_id). Rows of accounts that never come back stay until the
-- account is deleted. Later, if the table grows: a plain-SQL daily pg_cron delete of rows older
-- than a day (needs no secrets). Not added here.
--
-- Edge functions call this through supabase/functions/_shared/rateLimit.ts. Until this file is on
-- live the call fails (function not found) and they fall back to the old in-memory limiter, so
-- functions and this file can be deployed in either order.

create table public.ai_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  fn text not null check (char_length(fn) between 1 and 64),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (user_id, fn, window_start)
);

comment on table public.ai_rate_limits is
  'Per-window hit counters for the AI/search edge functions (per account and function). Written only by take_rate_limit(); no client access.';

alter table public.ai_rate_limits enable row level security;

-- No policies: clients cannot read or write it. take_rate_limit runs as its owner.
revoke all on public.ai_rate_limits from public, anon, authenticated;
grant all on public.ai_rate_limits to service_role;

create or replace function public.take_rate_limit(
  p_fn text,
  p_limit integer,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_window timestamptz;
  v_hits integer;
begin
  if v_uid is null then
    raise exception 'take_rate_limit: not signed in' using errcode = '42501';
  end if;
  if p_fn is null or p_fn not in ('pantry-vision', 'recipe-import', 'recipeapi-proxy', 'viral-recipes',
                                  'ask-forky', 'usda-proxy') then
    raise exception 'take_rate_limit: unknown function name' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'take_rate_limit: limit out of range' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds not in (60, 3600, 86400) then
    raise exception 'take_rate_limit: window must be 60, 3600 or 86400 seconds' using errcode = '22023';
  end if;

  -- Fixed window aligned to the epoch (e.g. the start of the current UTC minute).
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);

  insert into public.ai_rate_limits as r (user_id, fn, window_start, hits)
  values (v_uid, p_fn, v_window, 1)
  on conflict (user_id, fn, window_start) do update
    set hits = r.hits + 1
    where r.hits < p_limit
  returning r.hits into v_hits;

  if v_hits is null then
    return false; -- the row exists and is already at the limit
  end if;

  if v_hits = 1 then
    -- New window for this caller: drop their windows older than a day.
    delete from public.ai_rate_limits
     where user_id = v_uid
       and window_start < clock_timestamp() - interval '1 day';
  end if;

  return true;
end;
$$;

comment on function public.take_rate_limit(text, integer, integer) is
  'Takes one hit from the signed-in caller''s current window for an edge function; false when the window is full. Uses auth.uid() only.';

revoke all on function public.take_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.take_rate_limit(text, integer, integer) to authenticated;
