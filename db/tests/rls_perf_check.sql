-- Checks for db/supabase/migrations/20261017000000_rls_perf.sql (NOT on live): every public
-- policy now calls auth.uid() / auth.role() / auth.jwt() / is_admin() in the once-per-query
-- (select ...) form, the policies keep their names, commands and roles, the two foreign-key
-- indexes exist, and who sees what is unchanged: a user sees and changes own rows only, an admin
-- still sees everyone's pantry, anon sees nothing (pantry_items, grocery_list_items, profiles,
-- recipes). Runs in one transaction and rolls back.
--
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/tests/rls_perf_check.sql

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- 1. Form: no public policy calls these functions bare (per row) any more.
do $$
declare
  r record;
  expr text;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    foreach expr in array array[coalesce(r.qual, ''), coalesce(r.with_check, '')] loop
      expr := replace(expr, '( SELECT auth.uid() AS uid)', '');
      expr := replace(expr, '( SELECT auth.role() AS role)', '');
      expr := replace(expr, '( SELECT auth.jwt() AS jwt)', '');
      expr := replace(expr, '( SELECT is_admin() AS is_admin)', '');
      if expr ~ '(auth\.(uid|role|jwt)\(\)|is_admin\(\))' then
        raise exception 'policy %.% still calls an auth function per row: %', r.tablename, r.policyname, expr;
      end if;
    end loop;
  end loop;
end
$$;

-- 2. Each policy this file altered: still there, same command and roles, and uses the wrapped form.
do $$
declare
  want text[][] := array[
    -- table, policy, command, roles
    ['billing_subscriptions', 'billing_subscriptions_select_self', 'SELECT', '{authenticated}'],
    ['feature_flags', 'feature_flags_read', 'SELECT', '{public}'],
    ['feature_flags', 'feature_flags_admin_write', 'ALL', '{public}'],
    ['forky_chat_usage', 'forky_chat_usage_select_own', 'SELECT', '{authenticated}'],
    ['grocery_list_items', 'grocery_owner', 'ALL', '{public}'],
    ['meal_plan_items', 'meal_plan_delete_own', 'DELETE', '{public}'],
    ['meal_plan_items', 'meal_plan_insert_own', 'INSERT', '{public}'],
    ['meal_plan_items', 'meal_plan_select_own', 'SELECT', '{public}'],
    ['meal_plan_items', 'meal_plan_update_own', 'UPDATE', '{public}'],
    ['pantry_items', 'pantry_owner', 'ALL', '{public}'],
    ['pantry_items', 'pantry_admin_read', 'SELECT', '{public}'],
    ['photo_scan_usage', 'photo_scan_usage_select_own', 'SELECT', '{authenticated}'],
    ['profiles', 'profiles_select_self', 'SELECT', '{public}'],
    ['profiles', 'profiles_update_self', 'UPDATE', '{public}'],
    ['profiles', 'profiles_admin_all', 'ALL', '{public}'],
    ['recipe_import_usage', 'recipe_import_usage_select_own', 'SELECT', '{authenticated}'],
    ['recipes', 'recipes_user_delete', 'DELETE', '{public}'],
    ['recipes', 'recipes_user_insert', 'INSERT', '{public}'],
    ['recipes', 'recipes_user_update', 'UPDATE', '{public}'],
    ['recipes', 'recipes_admin_master_all', 'ALL', '{authenticated}'],
    ['recipes', 'recipes_admin_write', 'ALL', '{public}'],
    ['scan_corrections', 'scan_corrections_admin_select', 'SELECT', '{authenticated}'],
    ['store_deal_votes', 'store_deal_votes_delete', 'DELETE', '{public}'],
    ['store_deal_votes', 'store_deal_votes_insert', 'INSERT', '{public}'],
    ['store_deal_votes', 'store_deal_votes_read', 'SELECT', '{public}'],
    ['store_deal_votes', 'store_deal_votes_update', 'UPDATE', '{public}'],
    ['store_deals', 'store_deals_delete_own', 'DELETE', '{public}'],
    ['store_deals', 'store_deals_insert', 'INSERT', '{public}'],
    ['store_deals', 'store_deals_read', 'SELECT', '{public}'],
    ['store_deals', 'store_deals_update_own', 'UPDATE', '{public}'],
    ['store_deals', 'store_deals_admin_delete', 'DELETE', '{public}'],
    ['user_diet_prefs', 'user_diet_prefs_insert', 'INSERT', '{public}'],
    ['user_diet_prefs', 'user_diet_prefs_select', 'SELECT', '{public}'],
    ['user_diet_prefs', 'user_diet_prefs_update', 'UPDATE', '{public}'],
    ['user_favorite_stores', 'user_favorite_stores_owner', 'ALL', '{public}'],
    ['user_saved_recipes', 'user_saved_recipes_owner', 'ALL', '{public}']
  ];
  i int;
  p record;
begin
  for i in 1 .. array_length(want, 1) loop
    select * into p from pg_policies
     where schemaname = 'public' and tablename = want[i][1] and policyname = want[i][2];
    if not found then raise exception 'policy %.% is missing', want[i][1], want[i][2]; end if;
    if p.cmd <> want[i][3] or p.roles::text <> want[i][4] or p.permissive <> 'PERMISSIVE' then
      raise exception 'policy %.% changed shape: % % %', want[i][1], want[i][2], p.cmd, p.roles, p.permissive;
    end if;
    if coalesce(p.qual, '') || coalesce(p.with_check, '') !~ '\( SELECT (auth\.(uid|role)\(\)|is_admin\(\)) AS ' then
      raise exception 'policy %.% does not use the (select ...) form', want[i][1], want[i][2];
    end if;
  end loop;

  -- USING-only / WITH CHECK-only stayed that way (no new WITH CHECK on the FOR ALL owner policies).
  if exists (select 1 from pg_policies where schemaname = 'public'
             and policyname in ('grocery_owner', 'pantry_owner', 'profiles_admin_all', 'recipes_admin_write',
                                'feature_flags_admin_write') and with_check is not null) then
    raise exception 'a USING-only policy gained a WITH CHECK';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
             and policyname in ('meal_plan_insert_own', 'recipes_user_insert', 'store_deals_insert',
                                'store_deal_votes_insert', 'user_diet_prefs_insert') and qual is not null) then
    raise exception 'an insert policy gained a USING';
  end if;
end
$$;

-- 3. The two foreign-key indexes the advisor asked for.
do $$
begin
  if to_regclass('public.billing_consents_user_id_idx') is null then
    raise exception 'billing_consents_user_id_idx is missing';
  end if;
  if to_regclass('public.user_saved_recipes_kitchen_recipe_id_idx') is null then
    raise exception 'user_saved_recipes_kitchen_recipe_id_idx is missing';
  end if;
end
$$;
\echo 'ok   rls perf: no per-row auth calls in public policies, 36 policies same shape, 2 FK indexes'

-- 4. Behaviour is unchanged.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e5', 'e@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000f6', 'f@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000a7', 'admin@example.test', '{}');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a7';

insert into public.pantry_items (user_id, ingredient_id, name, category, quantity, unit) values
  ('00000000-0000-4000-8000-0000000000e5', 'rpc-egg', 'RPC Eggs', 'dairy', 6, 'each'),
  ('00000000-0000-4000-8000-0000000000f6', 'rpc-milk', 'RPC Milk', 'dairy', 1, 'l');
insert into public.grocery_list_items (user_id, ingredient_id, name, category, quantity, unit) values
  ('00000000-0000-4000-8000-0000000000e5', 'rpc-flour', 'RPC Flour', 'pantry', 1, 'kg'),
  ('00000000-0000-4000-8000-0000000000f6', 'rpc-sugar', 'RPC Sugar', 'pantry', 1, 'kg');
insert into public.recipes (name, is_master, created_by) values
  ('RPC master', true, null),
  ('RPC own', false, '00000000-0000-4000-8000-0000000000e5'),
  ('RPC other', false, '00000000-0000-4000-8000-0000000000f6');

-- Signed in as E.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true) \g /dev/null

do $$
declare
  seen text;
  n int;
begin
  select string_agg(name, ',' order by name) into seen from public.pantry_items where name like 'RPC %';
  if seen is distinct from 'RPC Eggs' then raise exception 'E should see only own pantry item, saw %', seen; end if;

  select string_agg(name, ',' order by name) into seen from public.grocery_list_items where name like 'RPC %';
  if seen is distinct from 'RPC Flour' then raise exception 'E should see only own grocery row, saw %', seen; end if;

  select string_agg(id::text, ',') into seen from public.profiles
   where id in ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000f6',
                '00000000-0000-4000-8000-0000000000a7');
  if seen is distinct from '00000000-0000-4000-8000-0000000000e5' then
    raise exception 'E should see only own profile, saw %', seen;
  end if;

  select string_agg(name, ',' order by name) into seen from public.recipes where name like 'RPC %';
  if seen is distinct from 'RPC master,RPC own' then raise exception 'E should see master + own recipes, saw %', seen; end if;

  -- Writes: other people's rows out of reach, own rows still work.
  update public.pantry_items set quantity = 0 where name = 'RPC Milk';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'E changed F''s pantry item'; end if;
  update public.grocery_list_items set checked = true where name = 'RPC Sugar';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'E changed F''s grocery row'; end if;
  update public.profiles set household_size = 9 where id = '00000000-0000-4000-8000-0000000000f6';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'E changed F''s profile'; end if;
  delete from public.recipes where name = 'RPC other';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'E deleted F''s recipe'; end if;

  update public.grocery_list_items set checked = true where name = 'RPC Flour';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'E could not tick own grocery row'; end if;
  update public.profiles set household_size = 3 where id = '00000000-0000-4000-8000-0000000000e5';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'E could not update own profile'; end if;

  begin
    insert into public.grocery_list_items (user_id, ingredient_id, name, category, quantity, unit)
    values ('00000000-0000-4000-8000-0000000000f6', 'x', 'RPC X', 'other', 1, 'each');
    raise exception 'E inserted a grocery row for F';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.recipes (name, is_master, created_by)
    values ('RPC forged', false, '00000000-0000-4000-8000-0000000000f6');
    raise exception 'E inserted a recipe as F';
  exception when insufficient_privilege then null;
  end;
  insert into public.recipes (name, is_master, created_by)
  values ('RPC mine', false, '00000000-0000-4000-8000-0000000000e5');
end
$$;
\echo 'ok   rls perf: signed-in user sees and changes own pantry, grocery, profile, recipes only'

-- Signed in as the admin: is_admin() policies still apply.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}', true) \g /dev/null

do $$
declare
  n int;
begin
  select count(*) into n from public.pantry_items where name like 'RPC %';
  if n <> 2 then raise exception 'admin should see every pantry item, saw %', n; end if;
  select count(*) into n from public.profiles
   where id in ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000f6',
                '00000000-0000-4000-8000-0000000000a7');
  if n <> 3 then raise exception 'admin should see every profile, saw %', n; end if;
  -- Admin's own grocery list is empty; grocery has no admin policy.
  select count(*) into n from public.grocery_list_items where name like 'RPC %';
  if n <> 0 then raise exception 'admin should see no one else''s grocery rows, saw %', n; end if;
end
$$;
\echo 'ok   rls perf: admin still reads all pantry items and profiles, not grocery lists'

-- Signed out (anon).
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) \g /dev/null

do $$
declare
  n int;
  t text;
begin
  foreach t in array array['pantry_items', 'grocery_list_items', 'profiles', 'recipes'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
    exception when insufficient_privilege then n := 0; -- no table grant at all is also fine
    end;
    if n <> 0 then raise exception 'anon should see no % rows, saw %', t, n; end if;
  end loop;
end
$$;

reset role;
rollback;
\echo 'ok   rls perf: anon sees no pantry, grocery, profile or recipe rows'
