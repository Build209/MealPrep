-- Usage log: what signed-in people do in the app, as short named events.
--
-- Why: to see whether people come back, which Forky prompts they tap or close, and what happens
-- before someone subscribes or cancels. Later features (usual items, Forky backing off, the weekly
-- recap) read a person's own rows from here.
--
-- What a row holds: the account, an event name such as 'scan_saved', the app session it happened
-- in, the platform, and a few small values (a prompt name, a count). It never holds item names,
-- recipe names, questions typed to Forky, photos, location, or diet and allergy details.
--
-- Rules:
-- - Signed-in accounts only. Guests are not logged.
-- - The app can add rows for its own account and read its own rows. It cannot change or delete them.
-- - At most 500 events per account per day; anything over that is dropped without an error.
-- - Rows are deleted after 13 months, and with the account.

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  session_id text,
  platform text,
  created_at timestamptz not null default now(),
  constraint app_events_name_format check (name ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint app_events_props_object check (jsonb_typeof(props) = 'object'),
  constraint app_events_props_small check (pg_column_size(props) <= 600),
  constraint app_events_session_short check (session_id is null or char_length(session_id) <= 40),
  constraint app_events_platform_known check (platform is null or platform in ('web', 'ios', 'android'))
);

comment on table public.app_events is
  'Usage log: named events per signed-in account (no item names, chat text or photos). Insert and read own rows only; kept 13 months.';

-- Per-account reads (the row level security rule, the daily cap, account deletion) and reports by event.
create index if not exists app_events_user_created_idx on public.app_events (user_id, created_at desc);
create index if not exists app_events_name_created_idx on public.app_events (name, created_at desc);

alter table public.app_events enable row level security;

drop policy if exists app_events_insert_own on public.app_events;
create policy app_events_insert_own on public.app_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists app_events_select_own on public.app_events;
create policy app_events_select_own on public.app_events
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.app_events from public, anon, authenticated;
-- Column list: the app cannot choose the id or the time of a row.
grant insert (user_id, name, props, session_id, platform) on public.app_events to authenticated;
grant select on public.app_events to authenticated;
grant select, insert, delete on public.app_events to service_role;

-- Daily cap per account, so one account cannot fill the database. Extra rows are skipped quietly:
-- the app must never show an error because of the usage log.
create or replace function public.app_events_daily_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today_count integer;
begin
  select count(*) into v_today_count
    from (
      select 1
        from public.app_events
       where user_id = new.user_id
         and created_at >= now() - interval '24 hours'
       limit 500
    ) recent;
  if v_today_count >= 500 then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.app_events_daily_cap() from public, anon, authenticated;

drop trigger if exists app_events_daily_cap on public.app_events;
create trigger app_events_daily_cap
  before insert on public.app_events
  for each row execute function public.app_events_daily_cap();

-- Delete rows older than 13 months, once a day. Skipped where pg_cron is not installed
-- (a scratch database); on the live project pg_cron is already on.
do $$
declare
  existing_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed: app_events purge job not scheduled';
    return;
  end if;
  select jobid into existing_job_id from cron.job where jobname = 'app-events-purge-daily' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
  perform cron.schedule(
    'app-events-purge-daily',
    '17 9 * * *',
    $job$delete from public.app_events where created_at < now() - interval '13 months'$job$
  );
end $$;
