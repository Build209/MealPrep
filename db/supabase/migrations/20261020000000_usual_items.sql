-- Usual items (Features handoff, Feature 2): remember what a person buys, so the Grocery tab can
-- offer "your usuals" when one is due. Account level: it follows the person across phones.
--
-- NOT APPLIED TO LIVE. Needs the owner's yes, and compliance review of the privacy-page line
-- before the app code that reads it ships. Safe to run before the app code: nothing reads these
-- tables until that code is on live.
--
-- What is stored (per account): the item's name as it was on the grocery list, a lower-case key
-- for matching, and the day it was ticked off as bought. No quantity, price, store, photo, or
-- anything the person did not already put on their own list.
--
-- How rows get in: only the trigger below writes purchase_history, when a grocery row goes from
-- not bought to bought (the Grocery tab's tick). Clients cannot insert or edit purchases, only
-- read and delete their own (delete = "forget my usuals"). Unticking the same day takes that
-- day's purchase back out (once no other ticked row of that item is left). Same name on the same
-- day counts once. At most 400 purchases are kept
-- per account (oldest dropped). All rows go when the account is deleted (on delete cascade).
--
-- usual_item_settings: the person's own choices per item: hide it for good, or snooze it until a
-- date. At most 500 rows per account.

create table public.purchase_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name_key text not null check (char_length(name_key) between 1 and 80),
  name text not null check (char_length(name) between 1 and 80),
  bought_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, name_key, bought_on)
);

create index purchase_history_user_created_idx on public.purchase_history (user_id, created_at desc);

create table public.usual_item_settings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  name_key text not null check (char_length(name_key) between 1 and 80),
  hidden boolean not null default false,
  snoozed_until date,
  updated_at timestamptz not null default now(),
  primary key (user_id, name_key)
);

comment on table public.purchase_history is
  'Days a person ticked a grocery item as bought (name and day only), written by trigger record_grocery_purchase. Own rows readable and deletable by the person; never writable by clients. Feeds the Grocery tab''s "your usuals".';
comment on table public.usual_item_settings is
  'A person''s own choices about usual items: hidden for good, or snoozed until a date.';

-- The key used to match the same item across days: lower case, spaces collapsed. The app uses the
-- same rule (app/src/usuals/usualItems.ts, usualKey).
create or replace function public.usual_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.record_grocery_purchase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := public.usual_key(new.name);
  v_name text := left(btrim(new.name), 80);
begin
  if char_length(v_key) < 1 or char_length(v_key) > 80 then
    return new;
  end if;

  if new.checked then
    insert into public.purchase_history (user_id, name_key, name, bought_on)
    values (new.user_id, v_key, v_name, current_date)
    on conflict (user_id, name_key, bought_on) do nothing;

    -- Keep the newest 400 purchases for this person.
    delete from public.purchase_history
     where id in (
       select id from public.purchase_history
        where user_id = new.user_id
        order by created_at desc, id desc
        offset 400
     );
  else
    -- Unticked: take back today's purchase of this item, unless another ticked row of the same
    -- item is still on the list (two rows of "eggs" count as one purchase until both are unticked).
    if not exists (
      select 1 from public.grocery_list_items g
       where g.user_id = new.user_id and g.checked and g.id <> new.id
         and public.usual_key(g.name) = v_key
    ) then
      delete from public.purchase_history
       where user_id = new.user_id and name_key = v_key and bought_on = current_date;
    end if;
  end if;
  return new;
end
$$;

create trigger grocery_purchase_history
  after update of checked on public.grocery_list_items
  for each row
  when (old.checked is distinct from new.checked)
  execute function public.record_grocery_purchase();

create or replace function public.usual_settings_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.usual_item_settings where user_id = new.user_id) >= 500 then
    raise exception 'Too many saved choices.' using errcode = '54000';
  end if;
  return new;
end
$$;

create trigger usual_item_settings_cap
  before insert on public.usual_item_settings
  for each row execute function public.usual_settings_cap();

alter table public.purchase_history enable row level security;
alter table public.usual_item_settings enable row level security;

create policy purchase_history_select_own on public.purchase_history as permissive for select to authenticated
  using (user_id = (select auth.uid()));
create policy purchase_history_delete_own on public.purchase_history as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

create policy usual_item_settings_select_own on public.usual_item_settings as permissive for select to authenticated
  using (user_id = (select auth.uid()));
create policy usual_item_settings_insert_own on public.usual_item_settings as permissive for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy usual_item_settings_update_own on public.usual_item_settings as permissive for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy usual_item_settings_delete_own on public.usual_item_settings as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.purchase_history, public.usual_item_settings from public, anon, authenticated;
grant select, delete on public.purchase_history to authenticated;
grant select, delete on public.usual_item_settings to authenticated;
grant insert (user_id, name_key, hidden, snoozed_until) on public.usual_item_settings to authenticated;
-- user_id and name_key are updatable only because an upsert (insert ... on conflict do update)
-- rewrites every column it sends; the update policy's check still keeps the row the caller's own.
grant update (user_id, name_key, hidden, snoozed_until, updated_at) on public.usual_item_settings to authenticated;
grant all on public.purchase_history, public.usual_item_settings to service_role;

revoke all on function public.usual_key(text) from public, anon;
grant execute on function public.usual_key(text) to authenticated, service_role;
revoke all on function public.record_grocery_purchase() from public, anon, authenticated;
revoke all on function public.usual_settings_cap() from public, anon, authenticated;
