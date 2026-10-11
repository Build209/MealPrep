-- Learning sync: what the app learns about a household, kept with the account.
--
-- Until now the purchase memory behind "Your usuals" and the recipe events behind recipe ranking
-- lived only on each device, so a new phone started from nothing and nothing accumulated. These
-- tables hold the same facts per account.
--
--   purchase_history     one row per item per day it was bought (a grocery tick or a receipt item)
--   usual_item_settings  items the person asked not to be suggested
--   recipe_events        recipes opened, planned, cooked, saved, skipped or hidden
--
-- Rules for all three:
-- - A signed-in account reads, adds and removes only its own rows. Signed-out visitors have no access.
-- - Rows go when the account is deleted.
-- - Nothing here holds diet, allergy or health settings, photos, location or anything typed to Forky.
-- - A per-account daily cap stops one account filling the database; rows over the cap are dropped
--   without an error.

create table if not exists public.purchase_history (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_key text not null,
  bought_on date not null,
  name text not null,
  unit text not null default 'each',
  category text,
  quantity numeric not null default 1,
  source text not null default 'tick',
  created_at timestamptz not null default now(),
  primary key (user_id, item_key, bought_on),
  constraint purchase_history_item_key_len check (char_length(item_key) between 1 and 120),
  constraint purchase_history_name_len check (char_length(name) between 1 and 80),
  constraint purchase_history_unit_len check (char_length(unit) between 1 and 24),
  constraint purchase_history_category_len check (category is null or char_length(category) <= 24),
  constraint purchase_history_quantity_range check (quantity > 0 and quantity < 100000),
  constraint purchase_history_source_known check (source in ('tick', 'receipt')),
  constraint purchase_history_day_sane check (bought_on >= date '2026-01-01' and bought_on <= (now() at time zone 'utc')::date + 2)
);

comment on table public.purchase_history is
  'Per account: one row per item per day it was bought (grocery tick or receipt item). Feeds "Your usuals". Own rows only.';

create table if not exists public.usual_item_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_key text not null,
  hidden boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key),
  constraint usual_item_settings_item_key_len check (char_length(item_key) between 1 and 120)
);

comment on table public.usual_item_settings is
  'Per account: items the person asked "Your usuals" not to suggest. Own rows only.';

create table if not exists public.recipe_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ref_key text not null,
  type text not null,
  at timestamptz not null,
  v2 jsonb,
  created_at timestamptz not null default now(),
  constraint recipe_events_unique unique (user_id, ref_key, type, at),
  constraint recipe_events_ref_key_len check (char_length(ref_key) between 1 and 200),
  constraint recipe_events_type_format check (type ~ '^[a-z][a-z_]{1,23}$'),
  constraint recipe_events_v2_object check (v2 is null or jsonb_typeof(v2) = 'object'),
  constraint recipe_events_v2_small check (v2 is null or pg_column_size(v2) <= 2000),
  constraint recipe_events_at_sane check (at >= timestamptz '2026-01-01' and at <= now() + interval '2 days')
);

comment on table public.recipe_events is
  'Per account: recipes opened, planned, cooked, saved, skipped or hidden. Feeds recipe ranking. Own rows only.';

create index if not exists recipe_events_user_at_idx on public.recipe_events (user_id, at desc);
create index if not exists purchase_history_user_day_idx on public.purchase_history (user_id, bought_on desc);

alter table public.purchase_history enable row level security;
alter table public.usual_item_settings enable row level security;
alter table public.recipe_events enable row level security;

create policy purchase_history_select_own on public.purchase_history
  for select to authenticated using (user_id = (select auth.uid()));
create policy purchase_history_insert_own on public.purchase_history
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy purchase_history_delete_own on public.purchase_history
  for delete to authenticated using (user_id = (select auth.uid()));

create policy usual_item_settings_select_own on public.usual_item_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy usual_item_settings_insert_own on public.usual_item_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy usual_item_settings_update_own on public.usual_item_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy usual_item_settings_delete_own on public.usual_item_settings
  for delete to authenticated using (user_id = (select auth.uid()));

create policy recipe_events_select_own on public.recipe_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy recipe_events_insert_own on public.recipe_events
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy recipe_events_delete_own on public.recipe_events
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.purchase_history from public, anon, authenticated;
revoke all on public.usual_item_settings from public, anon, authenticated;
revoke all on public.recipe_events from public, anon, authenticated;

-- Column lists: the app cannot choose a row's id or its created time.
grant select, delete on public.purchase_history to authenticated;
grant insert (user_id, item_key, bought_on, name, unit, category, quantity, source) on public.purchase_history to authenticated;
grant select, delete on public.usual_item_settings to authenticated;
grant insert (user_id, item_key, hidden) on public.usual_item_settings to authenticated;
grant update (hidden) on public.usual_item_settings to authenticated;
grant select, delete on public.recipe_events to authenticated;
grant insert (user_id, ref_key, type, at, v2) on public.recipe_events to authenticated;

grant select, insert, update, delete on public.purchase_history to service_role;
grant select, insert, update, delete on public.usual_item_settings to service_role;
grant select, insert, update, delete on public.recipe_events to service_role;

-- Daily cap per account for the two tables that grow. One function, the limit passed per trigger.
create or replace function public.learning_sync_daily_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := tg_argv[0]::integer;
  v_count integer;
begin
  execute format(
    'select count(*) from (select 1 from public.%I where user_id = $1 and created_at >= now() - interval ''24 hours'' limit %s) recent',
    tg_table_name,
    v_limit
  )
  into v_count
  using new.user_id;
  if v_count >= v_limit then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.learning_sync_daily_cap() from public, anon, authenticated;

create trigger purchase_history_daily_cap
  before insert on public.purchase_history
  for each row execute function public.learning_sync_daily_cap('400');

create trigger recipe_events_daily_cap
  before insert on public.recipe_events
  for each row execute function public.learning_sync_daily_cap('1500');
