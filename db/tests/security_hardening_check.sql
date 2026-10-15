-- Checks for db/supabase/migrations/20261015000000_security_hardening.sql (NOT on live):
-- scan_corrections rows are size-limited, a training photo path must be in the caller's own folder,
-- each person is capped at 1000 rows a day (extra rows skipped, no error), the counter table is out
-- of client reach, rows the old app sends still insert, and is_admin() stays callable by anon.
-- Runs in one transaction and rolls back.
--
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/tests/security_hardening_check.sql

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- 1. Structure and privileges.
do $$
declare
  c text;
begin
  foreach c in array array['scan_corrections_scan_id_len', 'scan_corrections_ai_name_len',
    'scan_corrections_user_name_len', 'scan_corrections_storage_location_len',
    'scan_corrections_model_len', 'scan_corrections_training_photo_path_len'] loop
    if not exists (select 1 from pg_constraint where conname = c and conrelid = 'public.scan_corrections'::regclass) then
      raise exception 'missing constraint %', c;
    end if;
  end loop;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'scan_corrections'
             and policyname = 'scan_corrections_insert_authenticated' and with_check = 'true') then
    raise exception 'scan_corrections insert policy is still WITH CHECK (true)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'scan_corrections_daily_cap'
                 and tgrelid = 'public.scan_corrections'::regclass) then
    raise exception 'daily cap trigger on scan_corrections is missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.scan_correction_daily_counts'::regclass) then
    raise exception 'scan_correction_daily_counts has row level security off';
  end if;
  if has_table_privilege('anon', 'public.scan_correction_daily_counts', 'select')
     or has_table_privilege('authenticated', 'public.scan_correction_daily_counts', 'select')
     or has_table_privilege('authenticated', 'public.scan_correction_daily_counts', 'insert')
     or has_table_privilege('authenticated', 'public.scan_correction_daily_counts', 'update') then
    raise exception 'clients can reach scan_correction_daily_counts';
  end if;
  if has_function_privilege('anon', 'public.scan_corrections_daily_cap()', 'execute')
     or has_function_privilege('authenticated', 'public.scan_corrections_daily_cap()', 'execute') then
    raise exception 'clients can execute scan_corrections_daily_cap';
  end if;

  -- Deliberately unchanged: RLS policies that apply to anon call is_admin().
  if not has_function_privilege('anon', 'public.is_admin()', 'execute') then
    raise exception 'anon lost is_admin (signed-out reads of tables whose policies call it would fail)';
  end if;
end
$$;
\echo 'ok   security: scan_corrections limits, policy, cap trigger in place; counter table service-only'

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000005c1', 'shc-a@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000005c2', 'shc-b@example.test', '{}');

-- 2. Signed in as A: what the old app sends still inserts; bad rows are refused.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005c1","role":"authenticated"}', true) \g /dev/null

-- Same shape as mobile/lib/scanCorrections/diff.ts rows (rename, removed, added; with and without a photo).
insert into public.scan_corrections (scan_id, kind, ai_name, user_name, storage_location, model, training_photo_path) values
  ('11111111-2222-4333-8444-555555555555', 'rename', 'Tomatoe', 'Tomato', 'pantry', 'gemini-2.5-flash',
   '00000000-0000-4000-8000-0000000005c1/pantry/11111111-2222-4333-8444-555555555555.jpg'),
  ('11111111-2222-4333-8444-555555555555', 'removed', 'Napkins', null, null, 'gemini-2.5-flash', null),
  ('11111111-2222-4333-8444-555555555555', 'added', null, 'Basil', 'fridge', null, null);

do $$
begin
  begin
    insert into public.scan_corrections (scan_id, kind, ai_name, training_photo_path)
    values ('SHC-other-path', 'removed', 'x', '00000000-0000-4000-8000-0000000005c2/pantry/a.jpg');
    raise exception 'inserted a row pointing at another person''s training photo';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.scan_corrections (scan_id, kind, user_name) values ('SHC-long', 'added', repeat('x', 201));
    raise exception 'inserted a 201-character user_name';
  exception when check_violation then null;
  end;

  begin
    insert into public.scan_corrections (scan_id, kind, ai_name) values ('', 'removed', 'x');
    raise exception 'inserted an empty scan_id';
  exception when check_violation then null;
  end;

  begin
    insert into public.scan_corrections (scan_id, kind, ai_name) values (repeat('s', 65), 'removed', 'x');
    raise exception 'inserted a 65-character scan_id';
  exception when check_violation then null;
  end;
end
$$;

-- 3. Daily cap: 3 rows so far; 1002 more attempted -> only 997 kept (1000 total), no error.
insert into public.scan_corrections (scan_id, kind, ai_name)
select 'SHC-cap', 'removed', 'item ' || g from generate_series(1, 1002) g;

-- B has a separate allowance.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005c2","role":"authenticated"}', true) \g /dev/null
insert into public.scan_corrections (scan_id, kind, ai_name) values ('SHC-b', 'removed', 'x');

-- Members cannot read the table or the counters.
do $$
declare
  n int;
begin
  select count(*) into n from public.scan_corrections where scan_id like 'SHC-%';
  if n <> 0 then raise exception 'a member can read scan_corrections (% rows)', n; end if;
  begin
    select count(*) into n from public.scan_correction_daily_counts;
    raise exception 'a member can read scan_correction_daily_counts';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- Signed out: no insert at all.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) \g /dev/null
do $$
begin
  begin
    insert into public.scan_corrections (scan_id, kind, ai_name) values ('SHC-anon', 'removed', 'x');
    raise exception 'anon inserted a scan correction';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null

-- Server side (no auth.uid()): not capped and not counted.
insert into public.scan_corrections (scan_id, kind, ai_name) values ('SHC-server', 'removed', 'x');

do $$
declare
  n int;
begin
  select count(*) into n from public.scan_corrections where scan_id = 'SHC-cap';
  if n <> 997 then raise exception 'daily cap: expected 997 SHC-cap rows kept, found %', n; end if;
  select count(*) into n from public.scan_corrections where scan_id = '11111111-2222-4333-8444-555555555555';
  if n <> 3 then raise exception 'old-app rows: expected 3, found %', n; end if;
  select count(*) into n from public.scan_corrections where scan_id in ('SHC-b', 'SHC-server');
  if n <> 2 then raise exception 'B''s row and the server row should both insert, found %', n; end if;
  select count(*) into n from public.scan_corrections
   where scan_id in ('SHC-other-path', 'SHC-long', 'SHC-anon') or scan_id = '' or scan_id like 'sss%';
  if n <> 0 then raise exception 'refused rows were stored (%)', n; end if;

  select rows_logged into n from public.scan_correction_daily_counts
   where user_id = '00000000-0000-4000-8000-0000000005c1' and day = (now() at time zone 'utc')::date;
  if n is distinct from 1005 then raise exception 'A''s counter: expected 1005 attempts, found %', n; end if;
  select count(*) into n from public.scan_correction_daily_counts;
  if n <> 2 then raise exception 'expected counters for A and B only, found %', n; end if;
end
$$;

-- 4. Deleting an account removes its counters.
delete from auth.users where id = '00000000-0000-4000-8000-0000000005c2';
do $$
begin
  if exists (select 1 from public.scan_correction_daily_counts where user_id = '00000000-0000-4000-8000-0000000005c2') then
    raise exception 'counter row survived account deletion';
  end if;
end
$$;

rollback;
\echo 'ok   security: old-app rows insert, foreign photo paths and oversized rows refused, 1000/day cap skips extras'
