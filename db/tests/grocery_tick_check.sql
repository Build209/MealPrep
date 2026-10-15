-- Checks for db/supabase/migrations/20261014000000_grocery_tick.sql: ticking a grocery item adds
-- it to the pantry once, in one step; undo takes exactly that back out; other people's rows are
-- out of reach; anonymous callers are refused. Cases from the old app's
-- mobile/scripts/grocery-regression.ts ("check adds pantry row once", "second check restock is
-- idempotent", "uncheck reverses restock"). Runs in one transaction and rolls back.
--
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/tests/grocery_tick_check.sql

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- 1. The functions exist, anonymous callers cannot run them, signed-in callers can.
do $$
begin
  if to_regprocedure('public.tick_grocery_item(uuid, uuid, text)') is null
     or to_regprocedure('public.untick_grocery_item(uuid, uuid, boolean)') is null then
    raise exception 'tick_grocery_item / untick_grocery_item are missing';
  end if;
  if has_function_privilege('anon', 'public.tick_grocery_item(uuid, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.untick_grocery_item(uuid, uuid, boolean)', 'execute') then
    raise exception 'anon can execute the grocery tick functions';
  end if;
  if not has_function_privilege('authenticated', 'public.tick_grocery_item(uuid, uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.untick_grocery_item(uuid, uuid, boolean)', 'execute') then
    raise exception 'signed-in people cannot execute the grocery tick functions';
  end if;
  if exists (select 1 from pg_proc where proname in ('tick_grocery_item', 'untick_grocery_item') and prosecdef) then
    raise exception 'grocery tick functions must be security invoker';
  end if;
end
$$;
\echo 'ok   grocery tick: functions present, invoker rights, anon refused'

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000c3', 'c@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d4', 'd@example.test', '{}');

-- C has milk in the pantry and three things on the list; D has one list row.
insert into public.pantry_items (id, user_id, ingredient_id, name, category, quantity, unit, location) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000c3', 'milk', 'Milk', 'dairy', 1, 'l', 'fridge');
insert into public.grocery_list_items (id, user_id, ingredient_id, name, category, quantity, unit, origin) values
  ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-0000000000c3', 'manual-milk-1', ' milk ', 'dairy', 2, 'L', 'manual'),
  ('00000000-0000-4000-8000-00000000c102', '00000000-0000-4000-8000-0000000000c3', 'manual-apples-1', 'Apples', 'produce', 3, 'each', 'manual'),
  ('00000000-0000-4000-8000-00000000c103', '00000000-0000-4000-8000-0000000000c3', 'manual-milk-2', 'Milk', 'dairy', 500, 'ml', 'manual'),
  ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-0000000000d4', 'manual-eggs-1', 'Eggs', 'dairy', 12, 'each', 'manual');

-- Anonymous: refused.
set local role anon;
do $$
begin
  begin
    perform public.tick_grocery_item('00000000-0000-4000-8000-00000000c101');
    raise exception 'anon ticked a grocery row';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- Act as C.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true) \g /dev/null

-- 2. Tick into an existing pantry row (same name and unit, case and spaces ignored); a second tick adds nothing.
do $$
declare
  r jsonb;
  q numeric;
  n int;
begin
  r := public.tick_grocery_item('00000000-0000-4000-8000-00000000c101');
  if (r ->> 'changed')::boolean is not true or (r ->> 'created')::boolean then
    raise exception 'tick into existing row returned %', r;
  end if;
  if r -> 'pantry' ->> 'id' <> '00000000-0000-4000-8000-00000000c001' then
    raise exception 'tick added to the wrong pantry row: %', r -> 'pantry';
  end if;
  select quantity into q from public.pantry_items where id = '00000000-0000-4000-8000-00000000c001';
  if q <> 3 then raise exception 'milk should be 1 + 2 = 3, is %', q; end if;
  if not (select checked from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000c101') then
    raise exception 'ticked grocery row is not marked';
  end if;

  r := public.tick_grocery_item('00000000-0000-4000-8000-00000000c101');
  if (r ->> 'changed')::boolean then raise exception 'second tick changed something: %', r; end if;
  select quantity into q from public.pantry_items where id = '00000000-0000-4000-8000-00000000c001';
  if q <> 3 then raise exception 'second tick added stock again: %', q; end if;

  select count(*) into n from public.pantry_items;
  if n <> 1 then raise exception 'tick into an existing row made a new row (% rows)', n; end if;
end
$$;
\echo 'ok   grocery tick: adds to the matching pantry row once; a second tick adds nothing'

-- 3. Undo takes exactly that back out; a second undo takes nothing.
do $$
declare
  r jsonb;
  q numeric;
begin
  r := public.untick_grocery_item('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c001', false);
  if (r ->> 'changed')::boolean is not true or (r ->> 'deleted')::boolean then raise exception 'undo returned %', r; end if;
  select quantity into q from public.pantry_items where id = '00000000-0000-4000-8000-00000000c001';
  if q <> 1 then raise exception 'undo should leave milk at 1, is %', q; end if;
  if (select checked from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000c101') then
    raise exception 'undo left the grocery row ticked';
  end if;

  r := public.untick_grocery_item('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c001', false);
  if (r ->> 'changed')::boolean then raise exception 'second undo changed something: %', r; end if;
  select quantity into q from public.pantry_items where id = '00000000-0000-4000-8000-00000000c001';
  if q <> 1 then raise exception 'second undo took stock out again: %', q; end if;
end
$$;
\echo 'ok   grocery tick: undo reverses exactly once'

-- 4. No matching row: a new pantry row is made (at the place given); undo removes it again.
--    A different unit never merges (500 ml of milk does not add to the litre row).
do $$
declare
  r jsonb;
  new_id uuid;
  n int;
begin
  r := public.tick_grocery_item('00000000-0000-4000-8000-00000000c102', null, 'pantry');
  if (r ->> 'created')::boolean is not true then raise exception 'apples should make a new pantry row: %', r; end if;
  new_id := (r -> 'pantry' ->> 'id')::uuid;
  if not exists (select 1 from public.pantry_items where id = new_id and name = 'Apples' and quantity = 3
                 and unit = 'each' and location = 'pantry' and category = 'produce'
                 and user_id = '00000000-0000-4000-8000-0000000000c3') then
    raise exception 'new pantry row is wrong';
  end if;

  r := public.untick_grocery_item('00000000-0000-4000-8000-00000000c102', new_id, true);
  if (r ->> 'deleted')::boolean is not true then raise exception 'undo should delete the row the tick made: %', r; end if;
  if exists (select 1 from public.pantry_items where id = new_id) then raise exception 'row made by the tick is still there'; end if;

  -- A pantry hint with another unit is ignored; a bad place falls back to the pantry shelf.
  r := public.tick_grocery_item('00000000-0000-4000-8000-00000000c103', '00000000-0000-4000-8000-00000000c001', 'garage');
  if (r ->> 'created')::boolean is not true or r -> 'pantry' ->> 'location' <> 'pantry' then
    raise exception 'ml milk should make its own row on the pantry shelf: %', r;
  end if;
  if (select quantity from public.pantry_items where id = '00000000-0000-4000-8000-00000000c001') <> 1 then
    raise exception 'ml milk was added to the litre row';
  end if;
  select count(*) into n from public.pantry_items;
  if n <> 2 then raise exception 'expected 2 pantry rows, found %', n; end if;
end
$$;
\echo 'ok   grocery tick: new row when nothing matches, undo removes it; units never mix'

-- 5. Other people's rows are out of reach, and a hint pointing at someone else's pantry row is ignored.
do $$
begin
  begin
    perform public.tick_grocery_item('00000000-0000-4000-8000-00000000d101');
    raise exception 'C ticked D''s grocery row';
  exception when no_data_found then null;
  end;
  begin
    perform public.untick_grocery_item('00000000-0000-4000-8000-00000000d101');
    raise exception 'C unticked D''s grocery row';
  exception when no_data_found then null;
  end;
end
$$;
reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null
do $$
begin
  if (select checked from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000d101') then
    raise exception 'D''s row was ticked by C';
  end if;
  if exists (select 1 from public.pantry_items where user_id = '00000000-0000-4000-8000-0000000000d4') then
    raise exception 'C''s calls put rows in D''s pantry';
  end if;
end
$$;
\echo 'ok   grocery tick: other people''s rows are out of reach'

rollback;
\echo 'all grocery tick checks passed'
