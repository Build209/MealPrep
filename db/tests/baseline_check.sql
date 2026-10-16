-- Checks that a database built from the baseline behaves like the live one where the rebuild
-- depends on it: structure counts, sign-up, plan and role guards, row level security, function
-- privileges and allowance counters. Runs in one transaction and rolls back, so it leaves no data.
--
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/tests/baseline_check.sql
-- Any failed check raises an error and stops the run (non-zero exit).

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- 1. Structure matches what was read from live on 2026-10-13.
do $$
declare
  n int;
begin
  select count(*) into n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    -- Added by a later migration in this folder (checked in daily_caps_check.sql), not live yet.
    and c.relname not in ('daily_usage', 'ai_rate_limits', 'scan_correction_daily_counts');
  if n <> 29 then raise exception 'expected 29 public tables, found %', n; end if;

  select count(*) into n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception '% public tables have row level security off', n; end if;

  select count(*) into n from pg_policies where schemaname = 'public'
    and policyname not in ('daily_usage_select_own');
  if n <> 46 then raise exception 'expected 46 public policies, found %', n; end if;

  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    -- Added by later migrations in this folder (checked in their own test files), not in the
    -- 2026-10-13 baseline.
    and p.proname not in ('tick_grocery_item', 'untick_grocery_item', 'add_missing_to_grocery',
                          'daily_cap_for', 'take_daily_use', 'give_back_daily_use',
                          'list_expired_scan_photos', 'take_rate_limit', 'scan_corrections_daily_cap');
  if n <> 28 then raise exception 'expected 28 public functions, found %', n; end if;

  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass) then
    raise exception 'sign-up trigger on auth.users is missing';
  end if;

  select count(*) into n from storage.buckets
   where id in ('scan-photos', 'avatars', 'scan-training', 'recipe-import-uploads', 'library-recipe-images');
  if n <> 5 then raise exception 'expected 5 storage buckets, found %', n; end if;

  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and policyname in ('avatars_delete_own', 'avatars_insert_own', 'avatars_select_own', 'avatars_update_own',
     'library_recipe_images_select', 'recipe_import_uploads_delete_own', 'recipe_import_uploads_insert_own',
     'recipe_import_uploads_select_own', 'scan_photos_delete_own', 'scan_photos_insert_own',
     'scan_photos_select_own', 'scan_training_admin_select', 'scan_training_insert_own');
  if n <> 13 then raise exception 'expected 13 storage policies, found %', n; end if;
end
$$;
\echo 'ok   structure: 29 tables with RLS, 46 policies, 28 functions, sign-up trigger, 5 buckets, 13 storage policies'

-- Two test accounts. Sign-up metadata tries to sneak in admin and paid; the triggers must ignore it.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@example.test', '{"name":"Tester A","role":"admin","plan":"paid"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'b@example.test', '{}');

-- 2. Sign-up creates a free member profile.
do $$
declare
  p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';
  if not found then raise exception 'sign-up did not create a profile'; end if;
  if p.role <> 'member' or p.plan <> 'free' or p.plan_tier <> 'plus' or p.plan_comp then
    raise exception 'new profile should be free member, got role=% plan=% tier=% comp=%', p.role, p.plan, p.plan_tier, p.plan_comp;
  end if;
  if p.name <> 'Tester A' then raise exception 'profile name not taken from sign-up metadata: %', p.name; end if;
  if not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000b2' and name = 'b') then
    raise exception 'profile name should fall back to the email prefix';
  end if;
end
$$;
\echo 'ok   sign-up: profile created as free member, name from metadata or email'

-- Seed one pantry item each (as the database owner).
insert into public.pantry_items (user_id, ingredient_id, name, category, quantity, unit) values
  ('00000000-0000-4000-8000-0000000000a1', 'egg', 'Eggs', 'dairy', 6, 'each'),
  ('00000000-0000-4000-8000-0000000000b2', 'milk', 'Milk', 'dairy', 1, 'l');

-- From here on, act as signed-in user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true) \g /dev/null

-- 3. Row level security: A sees and changes only A's rows.
do $$
declare
  n int;
begin
  select count(*) into n from public.pantry_items;
  if n <> 1 then raise exception 'user A should see 1 pantry item, saw %', n; end if;

  update public.pantry_items set quantity = 0 where ingredient_id = 'milk';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'user A changed user B''s pantry item'; end if;

  begin
    insert into public.pantry_items (user_id, ingredient_id, name, category, quantity, unit)
    values ('00000000-0000-4000-8000-0000000000b2', 'x', 'X', 'other', 1, 'each');
    raise exception 'user A inserted a pantry item for user B';
  exception when insufficient_privilege then null;
  end;

  insert into public.pantry_items (user_id, ingredient_id, name, category, quantity, unit)
  values ('00000000-0000-4000-8000-0000000000a1', 'rice', 'Rice', 'pantry', 1, 'kg');

  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'user A should see only their own profile, saw %', n; end if;
end
$$;
\echo 'ok   row level security: own pantry rows and profile only'

-- 4. Plan and role guards: a member cannot give themselves a paid plan, another tier, or admin.
do $$
begin
  begin
    update public.profiles set plan = 'paid' where id = auth.uid();
    raise exception 'member was able to set their own plan to paid';
  exception when raise_exception then
    if sqlerrm not like 'Only admins can change subscription plans%' then raise; end if;
  end;

  begin
    update public.profiles set plan_tier = 'family' where id = auth.uid();
    raise exception 'member was able to change their own plan tier';
  exception when raise_exception then
    if sqlerrm not like 'Only admins can change subscription plans%' then raise; end if;
  end;

  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'member was able to make themselves admin';
  exception when raise_exception then
    if sqlerrm not like 'Only admins can change user roles%' then raise; end if;
  end;

  update public.profiles set household_size = 4 where id = auth.uid();
end
$$;
\echo 'ok   guards: members cannot change plan, tier or role; other profile fields save'

-- 5. Function privileges: allowance counters are server-only; admin calls refuse members.
do $$
begin
  begin
    perform public.claim_photo_scan(auth.uid(), '2026-10', 100);
    raise exception 'signed-in user could call claim_photo_scan directly';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.recompute_user_plan(auth.uid());
    raise exception 'signed-in user could call recompute_user_plan directly';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.admin_analytics();
    raise exception 'member could read admin analytics';
  exception when insufficient_privilege then null;
  end;

  -- Allowed: own weekly summary.
  perform * from public.my_kitchen_weeks('America/Los_Angeles', 4);
end
$$;
\echo 'ok   function privileges: counters and plan recompute are server-only, admin calls refused'

-- 6. Usage log: own events can be written (listed columns only) and read back.
do $$
declare
  n int;
begin
  insert into public.app_events (user_id, name, props, platform)
  values (auth.uid(), 'scan_saved', '{"count":3}', 'web');

  begin
    insert into public.app_events (user_id, name, created_at) values (auth.uid(), 'meal_made', now() - interval '1 year');
    raise exception 'user could backdate a usage event';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.app_events (user_id, name) values ('00000000-0000-4000-8000-0000000000b2', 'meal_made');
    raise exception 'user could log an event for another account';
  exception when insufficient_privilege then null;
  end;

  select count(*) into n from public.app_events;
  if n <> 1 then raise exception 'expected 1 own event, saw %', n; end if;
end
$$;
\echo 'ok   usage log: own events only, no backdating'

-- Back to the database owner for server-side checks.
reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null

-- 7. Allowance counter stops at the limit; refund gives one back.
do $$
declare
  left_after int[];
begin
  left_after := array[
    public.claim_photo_scan('00000000-0000-4000-8000-0000000000a1', '2026-10', 3),
    public.claim_photo_scan('00000000-0000-4000-8000-0000000000a1', '2026-10', 3),
    public.claim_photo_scan('00000000-0000-4000-8000-0000000000a1', '2026-10', 3),
    public.claim_photo_scan('00000000-0000-4000-8000-0000000000a1', '2026-10', 3)
  ];
  if left_after <> array[2, 1, 0, -1] then raise exception 'claim_photo_scan returned %', left_after; end if;

  perform public.settle_photo_scan('00000000-0000-4000-8000-0000000000a1', '2026-10', 100, 20, true);
  if public.claim_photo_scan('00000000-0000-4000-8000-0000000000a1', '2026-10', 3) <> 0 then
    raise exception 'a refunded scan was not available again';
  end if;
end
$$;
\echo 'ok   allowance: 3 of 3 then refused; refund returns one'

-- 8. Plan follows the Stripe subscription row.
do $$
declare
  p public.profiles%rowtype;
begin
  insert into public.billing_subscriptions (user_id, stripe_customer_id, status, plan_tier)
  values ('00000000-0000-4000-8000-0000000000a1', 'cus_test_baseline', 'active', 'pro');
  perform public.recompute_user_plan('00000000-0000-4000-8000-0000000000a1');
  select * into p from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';
  if p.plan <> 'paid' or p.plan_tier <> 'pro' then raise exception 'active pro gave plan=% tier=%', p.plan, p.plan_tier; end if;

  update public.billing_subscriptions set status = 'canceled' where stripe_customer_id = 'cus_test_baseline';
  perform public.recompute_user_plan('00000000-0000-4000-8000-0000000000a1');
  select * into p from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';
  if p.plan <> 'free' then raise exception 'canceled subscription left plan=%', p.plan; end if;
end
$$;
\echo 'ok   billing: active pro gives paid/pro; canceled returns to free'

-- 9. Deleting the account removes the kitchen data.
do $$
begin
  delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
  if exists (select 1 from public.pantry_items where user_id = '00000000-0000-4000-8000-0000000000a1')
     or exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000a1')
     or exists (select 1 from public.app_events where user_id = '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'account deletion left data behind';
  end if;
  if not exists (select 1 from public.billing_subscriptions where stripe_customer_id = 'cus_test_baseline' and user_id is null) then
    raise exception 'billing record should be kept with the account link cleared';
  end if;
end
$$;
\echo 'ok   account deletion: kitchen data gone, billing record kept without the account link'

rollback;
\echo 'all baseline checks passed'
