-- Checks for db/supabase/migrations/20261014100000_db_hardening.sql: the user_id indexes exist,
-- signed-out callers (anon) can run only the two functions they need, signed-in people can still
-- run the functions the app calls, the edge functions' service role can run theirs, signed-out
-- reads of tables whose policies call is_admin() still work, and a new function no longer gets
-- EXECUTE for anon or PUBLIC. Runs in one transaction and rolls back.
--
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/tests/db_hardening_check.sql

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- 1. Indexes on the per-user column.
do $$
declare
  want text[][] := array[
    ['pantry_items', 'user_id'],
    ['grocery_list_items', 'user_id'],
    ['store_deal_votes', 'user_id'],
    ['store_deals', 'reported_by'],
    ['recipes', 'created_by']
  ];
  i int;
begin
  for i in 1 .. array_length(want, 1) loop
    if not exists (
      select 1
      from pg_index x
      join pg_class t on t.oid = x.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = x.indkey[0]
      where n.nspname = 'public' and t.relname = want[i][1] and a.attname = want[i][2]
        and x.indpred is null and x.indisvalid
    ) then
      raise exception 'no full index leading with %.%', want[i][1], want[i][2];
    end if;
  end loop;
end
$$;
\echo 'ok   hardening: user_id indexes on pantry, grocery, deal votes, deals, recipes'

-- 2. anon can execute exactly is_admin and nearby_stores, nothing else in schema public.
do $$
declare
  extra text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into extra
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname not in ('is_admin', 'nearby_stores')
    and has_function_privilege('anon', p.oid, 'execute');
  if extra is not null then
    raise exception 'anon can execute: %', extra;
  end if;
  if has_function_privilege('anon', 'public.search_creator_videos(text, integer)', 'execute') then
    raise exception 'anon can still execute search_creator_videos';
  end if;
  if not has_function_privilege('anon', 'public.is_admin()', 'execute') then
    raise exception 'anon lost is_admin (RLS policies for signed-out reads call it)';
  end if;
  if not has_function_privilege('anon', 'public.nearby_stores(double precision, double precision, integer, integer)', 'execute') then
    raise exception 'anon lost nearby_stores (the old app''s Stores tab works signed out)';
  end if;
  -- No PUBLIC grant on anything except is_admin.
  select string_agg(p.oid::regprocedure::text, ', ') into extra
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where n.nspname = 'public' and p.proname <> 'is_admin'
    and a.grantee = 0 and a.privilege_type = 'EXECUTE';
  if extra is not null then
    raise exception 'PUBLIC can execute: %', extra;
  end if;
end
$$;
\echo 'ok   hardening: anon can execute only is_admin and nearby_stores; no PUBLIC grants'

-- 3. Signed-in people keep what the app calls; the service role keeps what edge functions call.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.tick_grocery_item(uuid, uuid, text)',
    'public.untick_grocery_item(uuid, uuid, boolean)',
    'public.add_missing_to_grocery(text, jsonb)',
    'public.my_kitchen_weeks(text, integer)',
    'public.search_creator_videos(text, integer)',
    'public.nearby_stores(double precision, double precision, integer, integer)',
    'public.is_admin()',
    'public.admin_analytics()',
    'public.admin_lookup_user_by_email(text)',
    'public.admin_scan_corrections_summary(integer)',
    'public.admin_set_user_plan(uuid, public.user_plan)',
    'public.admin_set_user_role(uuid, public.user_role)'
  ] loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'signed-in people cannot execute %', f;
    end if;
  end loop;

  foreach f in array array[
    'public.claim_forky_message(uuid, text, integer)',
    'public.settle_forky_message(uuid, text, integer, integer, boolean)',
    'public.claim_photo_scan(uuid, text, integer)',
    'public.settle_photo_scan(uuid, text, integer, integer, boolean)',
    'public.begin_photo_scan_request(uuid, text, integer, integer)',
    'public.finish_photo_scan_request(uuid, text, jsonb)',
    'public.claim_recipe_import(uuid, text, integer)',
    'public.refund_recipe_import(uuid, text)',
    'public.recompute_user_plan(uuid)',
    'public.delete_user_owned_data(uuid)',
    'public.try_acquire_viral_recipes_refresh_lock(integer)',
    'public.release_viral_recipes_refresh_lock()',
    'public.complete_viral_recipes_refresh_success()',
    'public.complete_viral_recipes_refresh_failure(integer)',
    'public.search_creator_videos(text, integer)'
  ] loop
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception 'service role cannot execute %', f;
    end if;
    -- The allowance and server functions stay out of signed-in reach.
    if f <> 'public.search_creator_videos(text, integer)'
       and has_function_privilege('authenticated', f, 'execute') then
      raise exception 'signed-in people can execute server-only %', f;
    end if;
  end loop;
end
$$;
\echo 'ok   hardening: signed-in keeps app functions, service role keeps edge-function ones'

-- 4. Calls, not just grants: anon is refused search_creator_videos; a signed-in person runs it.
set local role anon;
do $$
begin
  begin
    perform public.search_creator_videos('pasta', 5);
    raise exception 'anon ran search_creator_videos';
  exception when insufficient_privilege then null;
  end;
end
$$;
-- Signed-out reads of tables whose policies call is_admin() still answer (with no rows), not
-- "permission denied".
do $$
begin
  perform count(*) from public.profiles;
  perform count(*) from public.pantry_items;
  perform count(*) from public.recipes;
  perform count(*) from public.feature_flags;
  perform count(*) from public.store_deals;
end
$$;
reset role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e5', 'e@example.test', '{}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true) \g /dev/null
do $$
begin
  perform public.search_creator_videos('pasta', 5);
  perform public.my_kitchen_weeks('UTC', 2);
  if public.is_admin() then raise exception 'a new member is admin'; end if;
end
$$;
reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null
\echo 'ok   hardening: anon refused search, signed-out reads still work, signed-in calls work'

-- 5. A new function made by postgres (as migrations are) is not executable by anon or PUBLIC.
-- Only meaningful when this check runs as postgres (CI does); skipped otherwise.
do $$
begin
  if current_user <> 'postgres' then
    raise notice 'skip default-privileges check: running as %, not postgres', current_user;
    return;
  end if;
  execute 'create function public.zz_hardening_probe() returns int language sql as ''select 1''';
  if has_function_privilege('anon', 'public.zz_hardening_probe()', 'execute') then
    raise exception 'a new function is executable by anon by default';
  end if;
  if exists (
    select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.zz_hardening_probe()'::regprocedure and a.grantee = 0
  ) then
    raise exception 'a new function is executable by PUBLIC by default';
  end if;
  if not has_function_privilege('authenticated', 'public.zz_hardening_probe()', 'execute')
     or not has_function_privilege('service_role', 'public.zz_hardening_probe()', 'execute') then
    raise exception 'a new function lost the authenticated / service_role default';
  end if;
end
$$;
\echo 'ok   hardening: new functions get no anon or PUBLIC EXECUTE by default'

rollback;
\echo 'all db hardening checks passed'
