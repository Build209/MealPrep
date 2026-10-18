-- Checks for db/supabase/migrations/20261021000000_usual_items.sql: ticking a grocery row records
-- one purchase (name and day), the same item twice in a day counts once, unticking takes the day's
-- purchase back, clients cannot write purchases, people see and delete only their own rows, the
-- 400-row cap holds, settings are own-only and capped, anonymous callers get nothing, and account
-- deletion removes everything. Runs in one transaction and rolls back.
--
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/tests/usual_items_check.sql

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- 1. Objects present and locked down.
do $$
begin
  if to_regclass('public.purchase_history') is null or to_regclass('public.usual_item_settings') is null then
    raise exception 'usual items tables are missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.purchase_history'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.usual_item_settings'::regclass) then
    raise exception 'row level security is off';
  end if;
  if has_table_privilege('anon', 'public.purchase_history', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.usual_item_settings', 'select,insert,update,delete') then
    raise exception 'anon has privileges on the usual items tables';
  end if;
  if has_table_privilege('authenticated', 'public.purchase_history', 'insert,update') then
    raise exception 'signed-in people can write purchases directly';
  end if;
  if has_function_privilege('anon', 'public.record_grocery_purchase()', 'execute')
     or has_function_privilege('authenticated', 'public.record_grocery_purchase()', 'execute')
     or has_function_privilege('authenticated', 'public.usual_settings_cap()', 'execute') then
    raise exception 'a trigger function is executable by a client role';
  end if;
  if public.usual_key('  Whole   MILK ') is distinct from 'whole milk' then
    raise exception 'usual_key gave %', public.usual_key('  Whole   MILK ');
  end if;
end
$$;
\echo 'ok   usual items: tables with RLS, no client writes to purchases, trigger functions closed, key rule'

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e5', 'e@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000f6', 'f@example.test', '{}');

insert into public.grocery_list_items (id, user_id, ingredient_id, name, category, quantity, unit, origin) values
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000000e5', 'manual-eggs-1', ' Eggs ', 'dairy', 12, 'each', 'manual'),
  ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-0000000000e5', 'manual-eggs-2', 'eggs', 'dairy', 6, 'each', 'manual'),
  ('00000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-0000000000f6', 'manual-milk-1', 'Milk', 'dairy', 1, 'l', 'manual');

-- Anonymous: nothing visible, nothing writable.
set local role anon;
do $$
begin
  begin
    perform count(*) from public.purchase_history;
    raise exception 'anon read purchase_history';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- 2. Act as E: ticking records one purchase; a second row of the same item the same day counts once.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true) \g /dev/null
do $$
declare n int; k text; nm text;
begin
  update public.grocery_list_items set checked = true where id = '00000000-0000-4000-8000-00000000e101';
  update public.grocery_list_items set checked = true where id = '00000000-0000-4000-8000-00000000e102';
  select count(*), min(name_key), min(name) into n, k, nm from public.purchase_history;
  if n <> 1 or k <> 'eggs' or nm <> 'Eggs' then
    raise exception 'expected one eggs purchase, got % (% / %)', n, k, nm;
  end if;
  -- A change that is not a tick change records nothing new.
  update public.grocery_list_items set quantity = 7 where id = '00000000-0000-4000-8000-00000000e101';
  select count(*) into n from public.purchase_history;
  if n <> 1 then raise exception 'a quantity edit changed purchases (%)', n; end if;
  -- Unticking one of the two rows keeps the purchase: the other eggs row is still ticked.
  update public.grocery_list_items set checked = false where id = '00000000-0000-4000-8000-00000000e102';
  select count(*) into n from public.purchase_history;
  if n <> 1 then raise exception 'untick of one of two rows left % purchases, expected 1', n; end if;
  -- Unticking the last ticked row takes the day's purchase back.
  update public.grocery_list_items set checked = false where id = '00000000-0000-4000-8000-00000000e101';
  select count(*) into n from public.purchase_history;
  if n <> 0 then raise exception 'untick left % purchases', n; end if;
end
$$;
\echo 'ok   usual items: tick records name and day once; edits record nothing; untick takes it back only when no other ticked row of the item is left'

-- 3. Clients cannot write purchases; they can delete their own.
do $$
declare n int;
begin
  begin
    insert into public.purchase_history (user_id, name_key, name) values ('00000000-0000-4000-8000-0000000000e5', 'x', 'x');
    raise exception 'a client inserted a purchase';
  exception when insufficient_privilege then null;
  end;
  update public.grocery_list_items set checked = true where id = '00000000-0000-4000-8000-00000000e101';
  delete from public.purchase_history;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'delete removed % rows', n; end if;
end
$$;
\echo 'ok   usual items: no client inserts; own purchases deletable'

-- 4. Settings: own rows only, capped at 500, other people's rows untouchable.
do $$
declare n int;
begin
  insert into public.usual_item_settings (user_id, name_key, hidden) values ('00000000-0000-4000-8000-0000000000e5', 'eggs', true);
  update public.usual_item_settings set hidden = false, snoozed_until = current_date + 7 where name_key = 'eggs';
  -- An upsert (what the app sends) updates the person's own row.
  insert into public.usual_item_settings (user_id, name_key, hidden, snoozed_until)
    values ('00000000-0000-4000-8000-0000000000e5', 'eggs', true, null)
    on conflict (user_id, name_key) do update set user_id = excluded.user_id, name_key = excluded.name_key,
      hidden = excluded.hidden, snoozed_until = excluded.snoozed_until;
  if not (select hidden from public.usual_item_settings where name_key = 'eggs') then
    raise exception 'upsert did not update the setting';
  end if;
  -- An upsert cannot take over someone else's row or move one to another person.
  begin
    update public.usual_item_settings set user_id = '00000000-0000-4000-8000-0000000000f6' where name_key = 'eggs';
    raise exception 'moved a setting to someone else';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.usual_item_settings (user_id, name_key) values ('00000000-0000-4000-8000-0000000000f6', 'milk');
    raise exception 'inserted a setting for someone else';
  exception when insufficient_privilege or check_violation then null;
  end;
  insert into public.usual_item_settings (user_id, name_key)
    select '00000000-0000-4000-8000-0000000000e5', 'item-' || g from generate_series(1, 499) g;
  begin
    insert into public.usual_item_settings (user_id, name_key) values ('00000000-0000-4000-8000-0000000000e5', 'one-too-many');
    raise exception 'the 501st setting was accepted';
  exception when program_limit_exceeded then null;
  end;
  select count(*) into n from public.usual_item_settings;
  if n <> 500 then raise exception 'expected 500 settings, got %', n; end if;
end
$$;
\echo 'ok   usual items: settings own-only and capped at 500'

-- 5. The 400-purchase cap, and F sees none of E's rows.
reset role;
insert into public.purchase_history (user_id, name_key, name, bought_on, created_at)
  select '00000000-0000-4000-8000-0000000000e5', 'seed-' || g, 'Seed ' || g, current_date - (g % 300), now() - make_interval(mins => g)
  from generate_series(1, 405) g;
-- One purchase older than 13 months: the next tick must drop it (compliance verdict 2026-10-18).
insert into public.purchase_history (user_id, name_key, name, bought_on, created_at)
  values ('00000000-0000-4000-8000-0000000000e5', 'ancient', 'Ancient', current_date - 430, now() - interval '430 days');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true) \g /dev/null
do $$
declare n int;
begin
  update public.grocery_list_items set checked = false where id = '00000000-0000-4000-8000-00000000e101';
  update public.grocery_list_items set checked = true where id = '00000000-0000-4000-8000-00000000e101';
  select count(*) into n from public.purchase_history;
  if n <> 400 then raise exception 'cap: expected 400 purchases, got %', n; end if;
  if exists (select 1 from public.purchase_history where name_key = 'seed-405') then
    raise exception 'cap kept the oldest purchase';
  end if;
  if not exists (select 1 from public.purchase_history where name_key = 'eggs') then
    raise exception 'cap dropped the newest purchase';
  end if;
  if exists (select 1 from public.purchase_history where name_key = 'ancient') then
    raise exception 'a purchase older than 13 months was kept';
  end if;
end
$$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true) \g /dev/null
do $$
declare n int;
begin
  select count(*) into n from public.purchase_history;
  if n <> 0 then raise exception 'F can see % of E''s purchases', n; end if;
  select count(*) into n from public.usual_item_settings;
  if n <> 0 then raise exception 'F can see % of E''s settings', n; end if;
  delete from public.purchase_history;
  update public.usual_item_settings set hidden = true;
end
$$;
reset role;
do $$
begin
  if (select count(*) from public.purchase_history where user_id = '00000000-0000-4000-8000-0000000000e5') <> 400 then
    raise exception 'F deleted or changed E''s purchases';
  end if;
  if exists (select 1 from public.usual_item_settings where hidden and name_key = 'item-1') then
    raise exception 'F changed E''s settings';
  end if;
end
$$;
\echo 'ok   usual items: 400-purchase cap keeps the newest; other people see and change nothing'

-- 6. Deleting the account removes the rows.
delete from auth.users where id = '00000000-0000-4000-8000-0000000000e5';
do $$
begin
  if exists (select 1 from public.purchase_history where user_id = '00000000-0000-4000-8000-0000000000e5')
     or exists (select 1 from public.usual_item_settings where user_id = '00000000-0000-4000-8000-0000000000e5') then
    raise exception 'rows survived account deletion';
  end if;
end
$$;
\echo 'ok   usual items: account deletion removes purchases and settings'

rollback;
\echo 'usual items checks passed'
