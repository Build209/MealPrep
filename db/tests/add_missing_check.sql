-- Checks for db/supabase/migrations/20261014030000_add_missing_to_grocery.sql: a recipe's missing
-- ingredients go onto the grocery list once; an open row of the same thing and unit gets the
-- quantity added (once per recipe); ticked rows and other units are left alone; other people's
-- lists are out of reach; anonymous callers are refused. Cases from the old app's
-- mobile/scripts/recipe-match-regression.ts ("second recipe increases broccoli quantity",
-- "repeat add at same servings should not duplicate rows"). Runs in one transaction and rolls back.
--
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/tests/add_missing_check.sql

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- 1. The function exists, anonymous callers cannot run it, signed-in callers can.
do $$
begin
  if to_regprocedure('public.add_missing_to_grocery(text, jsonb)') is null then
    raise exception 'add_missing_to_grocery is missing';
  end if;
  if has_function_privilege('anon', 'public.add_missing_to_grocery(text, jsonb)', 'execute') then
    raise exception 'anon can execute add_missing_to_grocery';
  end if;
  if not has_function_privilege('authenticated', 'public.add_missing_to_grocery(text, jsonb)', 'execute') then
    raise exception 'signed-in people cannot execute add_missing_to_grocery';
  end if;
  if exists (select 1 from pg_proc where proname = 'add_missing_to_grocery' and prosecdef) then
    raise exception 'add_missing_to_grocery must be security invoker';
  end if;
end
$$;
\echo 'ok   add missing: function present, invoker rights, anon refused'

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e5', 'e@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000f6', 'f@example.test', '{}');

-- E already has: 1 lb broccoli to buy (typed by hand), 2 lemons ticked (in the pantry), 500 g rice.
-- F has broccoli on their own list.
insert into public.grocery_list_items (id, user_id, ingredient_id, name, category, quantity, unit, checked, origin) values
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000000e5', 'manual-broccoli-1', ' Broccoli ', 'produce', 1, 'LB', false, 'manual'),
  ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-0000000000e5', 'lemon', 'Lemon', 'produce', 2, 'each', true, 'manual'),
  ('00000000-0000-4000-8000-00000000e103', '00000000-0000-4000-8000-0000000000e5', 'rice', 'Rice', 'dry_goods', 500, 'g', false, 'plan'),
  ('00000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-0000000000f6', 'broccoli', 'Broccoli', 'produce', 3, 'lb', false, 'manual');

-- Anonymous: refused.
set local role anon;
do $$
begin
  begin
    perform public.add_missing_to_grocery('r_x', '[{"name":"Broccoli","quantity":1,"unit":"lb"}]');
    raise exception 'anon added to a grocery list';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true) \g /dev/null

-- 2. First add: broccoli merges into the open row (name and unit, case and spaces ignored);
--    lemons get a NEW row because the only lemon row is ticked; rice in cups does not touch the
--    gram row; garlic is new.
do $$
declare
  r jsonb;
  n int;
  q numeric;
  ids jsonb;
  o text;
begin
  r := public.add_missing_to_grocery('r_recipe-a', '[
    {"ingredient_id":"broccoli","name":"Broccoli","category":"produce","quantity":2,"unit":"lb"},
    {"ingredient_id":"lemon","name":"Lemon","category":"produce","quantity":1,"unit":"each"},
    {"ingredient_id":"rice","name":"Rice","category":"dry_goods","quantity":1.5,"unit":"cup"},
    {"ingredient_id":"garlic","name":"Garlic","category":"produce","quantity":0,"unit":""}
  ]');
  if (r ->> 'added')::int <> 3 or (r ->> 'merged')::int <> 1 or (r ->> 'unchanged')::int <> 0 then
    raise exception 'first add returned %', r;
  end if;
  if jsonb_array_length(r -> 'rows') <> 4 then raise exception 'first add should return 4 rows: %', r; end if;

  select quantity, source_recipe_ids, origin into q, ids, o from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000e101';
  if q <> 3 then raise exception 'broccoli should be 1 + 2 = 3, is %', q; end if;
  if ids <> '["r_recipe-a"]'::jsonb then raise exception 'broccoli source ids: %', ids; end if;
  if o <> 'manual' then raise exception 'a hand-typed row should stay manual, is %', o; end if;

  select quantity into q from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000e102';
  if q <> 2 then raise exception 'the ticked lemon row changed: %', q; end if;
  select count(*) into n from public.grocery_list_items
   where user_id = '00000000-0000-4000-8000-0000000000e5' and name = 'Lemon' and not checked and origin = 'add_missing';
  if n <> 1 then raise exception 'expected one new open lemon row, found %', n; end if;

  select quantity into q from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000e103';
  if q <> 500 then raise exception 'rice in grams changed: %', q; end if;
  select count(*) into n from public.grocery_list_items
   where user_id = '00000000-0000-4000-8000-0000000000e5' and name = 'Rice' and unit = 'cup' and quantity = 1.5;
  if n <> 1 then raise exception 'expected a new rice row in cups, found %', n; end if;

  -- No amount and no unit: 1 each.
  select count(*) into n from public.grocery_list_items
   where user_id = '00000000-0000-4000-8000-0000000000e5' and name = 'Garlic' and unit = 'each' and quantity = 1
     and source_recipe_ids = '["r_recipe-a"]'::jsonb and category = 'produce';
  if n <> 1 then raise exception 'garlic row not as expected (% found)', n; end if;
end
$$;
\echo 'ok   add missing: merges into open rows of the same unit, new rows otherwise, ticked rows untouched'

-- 3. The same recipe again: nothing changes, no duplicate rows.
do $$
declare
  r jsonb;
  before_count int;
  after_count int;
  q numeric;
begin
  select count(*) into before_count from public.grocery_list_items where user_id = '00000000-0000-4000-8000-0000000000e5';
  r := public.add_missing_to_grocery('r_recipe-a', '[
    {"ingredient_id":"broccoli","name":"Broccoli","category":"produce","quantity":2,"unit":"lb"},
    {"ingredient_id":"garlic","name":"Garlic","category":"produce","quantity":1,"unit":"each"}
  ]');
  if (r ->> 'added')::int <> 0 or (r ->> 'merged')::int <> 0 or (r ->> 'unchanged')::int <> 2 then
    raise exception 'repeat add returned %', r;
  end if;
  select count(*) into after_count from public.grocery_list_items where user_id = '00000000-0000-4000-8000-0000000000e5';
  if after_count <> before_count then raise exception 'repeat add made rows (% -> %)', before_count, after_count; end if;
  select quantity into q from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000e101';
  if q <> 3 then raise exception 'repeat add changed the broccoli quantity: %', q; end if;
end
$$;
\echo 'ok   add missing: the same recipe twice adds nothing'

-- 4. A second recipe needing broccoli adds its amount and its id (matched by ingredient id).
do $$
declare
  r jsonb;
  q numeric;
  ids jsonb;
begin
  r := public.add_missing_to_grocery('l_recipe-b', '[{"ingredient_id":"manual-broccoli-1","name":"Broccoli florets","category":"produce","quantity":0.5,"unit":"lb"}]');
  if (r ->> 'merged')::int <> 1 then raise exception 'second recipe returned %', r; end if;
  select quantity, source_recipe_ids into q, ids from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000e101';
  if q <> 3.5 then raise exception 'broccoli should be 3 + 0.5 = 3.5, is %', q; end if;
  if ids <> '["r_recipe-a", "l_recipe-b"]'::jsonb then raise exception 'broccoli source ids: %', ids; end if;
end
$$;
\echo 'ok   add missing: a second recipe adds its quantity once'

-- 5. Bad input is refused; F's list is out of reach.
do $$
declare
  q numeric;
begin
  begin
    perform public.add_missing_to_grocery('', '[]');
    raise exception 'empty recipe id accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.add_missing_to_grocery('r_x', '{"name":"x"}');
    raise exception 'non-list items accepted';
  exception when invalid_parameter_value then null;
  end;
  select quantity into q from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000f101';
  if q is not null then raise exception 'C can read F''s grocery row'; end if;
end
$$;
reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null
do $$
begin
  if (select quantity from public.grocery_list_items where id = '00000000-0000-4000-8000-00000000f101') <> 3 then
    raise exception 'E''s adds changed F''s broccoli';
  end if;
  if (select count(*) from public.grocery_list_items where user_id = '00000000-0000-4000-8000-0000000000f6') <> 1 then
    raise exception 'E''s adds put rows on F''s list';
  end if;
end
$$;
\echo 'ok   add missing: bad input refused, other people''s lists out of reach'

rollback;
\echo 'all add missing checks passed'
