-- Checks for db/supabase/migrations/20261014090000_daily_caps.sql (rebuild spec section 4): each
-- paid tier stops at its daily cap while the month still has room; free is not capped daily;
-- admin counts as Family and a comped account follows its plan_tier; price-tag scans are not
-- capped daily; a new Pacific day starts again; a refund gives one daily use back; people read
-- only their own daily rows and cannot write them; anonymous and signed-in callers cannot run the
-- helpers. Runs in one transaction and rolls back.
--
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/tests/daily_caps_check.sql

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- 1. Objects present, helpers closed to clients, allowance functions keep their security.
do $$
declare
  f text;
begin
  if to_regclass('public.daily_usage') is null then raise exception 'table daily_usage is missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.daily_usage'::regclass) then
    raise exception 'daily_usage has row level security off';
  end if;
  foreach f in array array['public.daily_cap_for(uuid, text)', 'public.take_daily_use(uuid, text)',
                           'public.give_back_daily_use(uuid, text)'] loop
    if to_regprocedure(f) is null then raise exception '% is missing', f; end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'anon can execute %', f; end if;
    if has_function_privilege('authenticated', f, 'execute') then raise exception 'authenticated can execute %', f; end if;
    if (select prosecdef from pg_proc where oid = to_regprocedure(f)) then raise exception '% should be security invoker', f; end if;
  end loop;
  foreach f in array array['public.claim_photo_scan(uuid, text, integer)', 'public.claim_recipe_import(uuid, text, integer)',
                           'public.claim_forky_message(uuid, text, integer)',
                           'public.settle_photo_scan(uuid, text, integer, integer, boolean)',
                           'public.settle_forky_message(uuid, text, integer, integer, boolean)',
                           'public.refund_recipe_import(uuid, text)'] loop
    if not (select prosecdef from pg_proc where oid = to_regprocedure(f)) then raise exception '% lost security definer', f; end if;
    if (select proconfig from pg_proc where oid = to_regprocedure(f)) is distinct from array['search_path=public'] then
      raise exception '% search_path changed', f;
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception '% is executable by a client role', f;
    end if;
  end loop;
end
$$;
\echo 'ok   daily caps: table with RLS, helpers invoker-only and closed to anon/authenticated, allowance functions unchanged in security'

-- Anonymous: helpers refused.
set local role anon;
do $$
begin
  begin
    perform public.take_daily_use('00000000-0000-4000-8000-000000000d01', 'scan');
    raise exception 'anon ran take_daily_use';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- Accounts: plus, pro, family, free, admin (on the free plan), comped pro.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000d01', 'plus@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000d02', 'pro@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000d03', 'family@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000d04', 'free@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000d05', 'admin@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000d06', 'comp@example.test', '{}');
-- As the database owner (no end-user session), plan changes are allowed.
update public.profiles set plan = 'paid', plan_tier = 'plus'   where id = '00000000-0000-4000-8000-000000000d01';
update public.profiles set plan = 'paid', plan_tier = 'pro'    where id = '00000000-0000-4000-8000-000000000d02';
update public.profiles set plan = 'paid', plan_tier = 'family' where id = '00000000-0000-4000-8000-000000000d03';
update public.profiles set role = 'admin'                      where id = '00000000-0000-4000-8000-000000000d05';
update public.profiles set plan = 'paid', plan_comp = true, plan_tier = 'pro' where id = '00000000-0000-4000-8000-000000000d06';

-- Claims until refused (monthly limit 1000, far above any daily cap). Returns how many succeeded
-- and checks the refusal was the daily one (-2) and that the month kept only the successful ones.
create function pg_temp.claims_until_refused(p_user uuid, p_kind text, p_max int) returns int
language plpgsql as $$
declare
  n int := 0;
  r int;
  month_used int;
begin
  loop
    r := case p_kind
           when 'scan' then public.claim_photo_scan(p_user, '2026-10', 1000)
           when 'import' then public.claim_recipe_import(p_user, '2026-10', 1000)
           when 'forky' then public.claim_forky_message(p_user, '2026-10', 1000)
         end;
    if r < 0 then
      if r <> -2 then raise exception '% %: refusal returned % (expected -2, daily)', p_user, p_kind, r; end if;
      exit;
    end if;
    if r <> 1000 - (n + 1) then raise exception '% %: success returned % (expected monthly remaining %)', p_user, p_kind, r, 1000 - (n + 1); end if;
    n := n + 1;
    exit when n >= p_max;
  end loop;
  select case p_kind
           when 'scan' then (select scans from public.photo_scan_usage where user_id = p_user and period = '2026-10')
           when 'import' then (select imports from public.recipe_import_usage where user_id = p_user and period = '2026-10')
           when 'forky' then (select messages from public.forky_chat_usage where user_id = p_user and period = '2026-10')
         end into month_used;
  if month_used <> n then raise exception '% %: month shows % used after % successful claims', p_user, p_kind, month_used, n; end if;
  return n;
end
$$;

-- 2. Each paid tier stops at its daily cap; the month still has room and is not charged for the refusal.
do $$
declare
  t record;
  got int;
begin
  for t in select * from (values
      ('00000000-0000-4000-8000-000000000d01'::uuid, 'plus', 'scan', 5), ('00000000-0000-4000-8000-000000000d01'::uuid, 'plus', 'import', 3), ('00000000-0000-4000-8000-000000000d01'::uuid, 'plus', 'forky', 8),
      ('00000000-0000-4000-8000-000000000d02'::uuid, 'pro', 'scan', 8), ('00000000-0000-4000-8000-000000000d02'::uuid, 'pro', 'import', 5), ('00000000-0000-4000-8000-000000000d02'::uuid, 'pro', 'forky', 15),
      ('00000000-0000-4000-8000-000000000d03'::uuid, 'family', 'scan', 15), ('00000000-0000-4000-8000-000000000d03'::uuid, 'family', 'import', 10), ('00000000-0000-4000-8000-000000000d03'::uuid, 'family', 'forky', 25),
      ('00000000-0000-4000-8000-000000000d05'::uuid, 'admin=family', 'scan', 15), ('00000000-0000-4000-8000-000000000d05'::uuid, 'admin=family', 'import', 10), ('00000000-0000-4000-8000-000000000d05'::uuid, 'admin=family', 'forky', 25),
      ('00000000-0000-4000-8000-000000000d06'::uuid, 'comp pro', 'scan', 8), ('00000000-0000-4000-8000-000000000d06'::uuid, 'comp pro', 'import', 5), ('00000000-0000-4000-8000-000000000d06'::uuid, 'comp pro', 'forky', 15)
    ) as v(uid, label, kind, cap)
  loop
    got := pg_temp.claims_until_refused(t.uid, t.kind, 100);
    if got <> t.cap then raise exception '% %: % claims before the daily refusal, expected %', t.label, t.kind, got, t.cap; end if;
  end loop;
end
$$;
\echo 'ok   daily caps: Plus 5/3/8, Pro 8/5/15, Family 15/10/25; admin = Family, comped follows plan_tier; month not charged for a daily refusal'

-- 3. Free is not capped daily (only by its monthly number); price-tag scans are not capped daily.
do $$
declare
  i int;
begin
  for i in 1..20 loop
    if public.claim_photo_scan('00000000-0000-4000-8000-000000000d04', '2026-10', 100) < 0
       or public.claim_recipe_import('00000000-0000-4000-8000-000000000d04', '2026-10', 100) < 0
       or public.claim_forky_message('00000000-0000-4000-8000-000000000d04', '2026-10', 100) < 0 then
      raise exception 'free account refused at claim % with monthly room', i;
    end if;
  end loop;
  -- Monthly limit still applies to free (3 scans): -1, the monthly refusal.
  if public.claim_photo_scan('00000000-0000-4000-8000-000000000d04', '2026-11', 3) <> 2
     or public.claim_photo_scan('00000000-0000-4000-8000-000000000d04', '2026-11', 3) <> 1
     or public.claim_photo_scan('00000000-0000-4000-8000-000000000d04', '2026-11', 3) <> 0
     or public.claim_photo_scan('00000000-0000-4000-8000-000000000d04', '2026-11', 3) <> -1 then
    raise exception 'free monthly limit no longer stops at 3';
  end if;
  -- The Plus account is at its daily scan cap, yet price tags still go through.
  for i in 1..10 loop
    if public.claim_photo_scan('00000000-0000-4000-8000-000000000d01', '2026-10|tag', 200) < 0 then
      raise exception 'price-tag scan % refused by the daily cap', i;
    end if;
  end loop;
end
$$;
\echo 'ok   daily caps: free not capped daily (monthly 3 still stops it); price-tag scans not capped daily'

-- 4. The monthly limit still refuses first with -1 and leaves today's count alone.
-- Pro's daily import cap (5) was used up in step 2: start from a clean day, then a small monthly limit.
delete from public.daily_usage where user_id = '00000000-0000-4000-8000-000000000d02' and kind = 'import';
do $$
declare
  used_today int;
begin
  if public.claim_recipe_import('00000000-0000-4000-8000-000000000d02', '2027-01', 2) <> 1
     or public.claim_recipe_import('00000000-0000-4000-8000-000000000d02', '2027-01', 2) <> 0
     or public.claim_recipe_import('00000000-0000-4000-8000-000000000d02', '2027-01', 2) <> -1 then
    raise exception 'monthly limit of 2 did not return 1, 0, -1';
  end if;
  select used into used_today from public.daily_usage
   where user_id = '00000000-0000-4000-8000-000000000d02' and kind = 'import';
  if used_today <> 2 then raise exception 'a monthly refusal changed today''s count: %', used_today; end if;
end
$$;
\echo 'ok   daily caps: monthly refusal is still -1 and does not use a daily one'

-- 5. Refunds give one daily use back (scan via settle_photo_scan, import via refund_recipe_import,
--    Ask Forky via settle_forky_message); a settle without refund gives nothing back.
do $$
declare
  plus constant uuid := '00000000-0000-4000-8000-000000000d01';
begin
  perform public.settle_photo_scan(plus, '2026-10', 100, 20, false);
  if public.claim_photo_scan(plus, '2026-10', 1000) <> -2 then raise exception 'settle without refund gave a daily scan back'; end if;

  perform public.settle_photo_scan(plus, '2026-10', 0, 0, true);
  if public.claim_photo_scan(plus, '2026-10', 1000) < 0 then raise exception 'refunded scan not available again today'; end if;
  if public.claim_photo_scan(plus, '2026-10', 1000) <> -2 then raise exception 'refund gave back more than one scan'; end if;

  perform public.refund_recipe_import(plus, '2026-10');
  if public.claim_recipe_import(plus, '2026-10', 1000) < 0 then raise exception 'refunded import not available again today'; end if;
  if public.claim_recipe_import(plus, '2026-10', 1000) <> -2 then raise exception 'import refund gave back more than one'; end if;

  perform public.settle_forky_message(plus, '2026-10', 0, 0, true);
  if public.claim_forky_message(plus, '2026-10', 1000) < 0 then raise exception 'refunded question not available again today'; end if;
  if public.claim_forky_message(plus, '2026-10', 1000) <> -2 then raise exception 'question refund gave back more than one'; end if;

  -- A refunded price tag does not touch today's scan count.
  perform public.settle_photo_scan(plus, '2026-10|tag', 0, 0, true);
  if public.claim_photo_scan(plus, '2026-10', 1000) <> -2 then raise exception 'price-tag refund gave a daily scan back'; end if;
end
$$;
\echo 'ok   daily caps: each refund returns exactly one daily use; price-tag refunds do not'

-- 6. A new Pacific day starts again: move the Plus account's rows to yesterday.
do $$
declare
  plus constant uuid := '00000000-0000-4000-8000-000000000d01';
  today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if not exists (select 1 from public.daily_usage where user_id = plus and kind = 'scan' and day = today and used = 5) then
    raise exception 'today''s row is not keyed by the Pacific date %', today;
  end if;
  update public.daily_usage set day = day - 1 where user_id = plus;
  if public.claim_photo_scan(plus, '2026-10', 1000) < 0 then raise exception 'scan refused on a new day'; end if;
  if public.claim_recipe_import(plus, '2026-10', 1000) < 0 then raise exception 'import refused on a new day'; end if;
  if public.claim_forky_message(plus, '2026-10', 1000) < 0 then raise exception 'question refused on a new day'; end if;
  if (select used from public.daily_usage where user_id = plus and kind = 'scan' and day = today - 1) <> 5 then
    raise exception 'yesterday''s count changed';
  end if;
end
$$;
\echo 'ok   daily caps: a new Pacific day starts from zero; yesterday kept'

-- 7. People read only their own daily rows and cannot write them.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d02","role":"authenticated"}', true) \g /dev/null
do $$
declare
  n int;
begin
  select count(*) into n from public.daily_usage where user_id <> '00000000-0000-4000-8000-000000000d02';
  if n <> 0 then raise exception 'Pro account sees % daily rows of other people', n; end if;
  select count(*) into n from public.daily_usage;
  if n = 0 then raise exception 'Pro account cannot see its own daily rows'; end if;

  begin
    update public.daily_usage set used = 0;
    raise exception 'signed-in user could reset their daily count';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.daily_usage (user_id, kind, day, used)
    values ('00000000-0000-4000-8000-000000000d02', 'scan', current_date + 1, 0);
    raise exception 'signed-in user could insert a daily row';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.daily_usage;
    raise exception 'signed-in user could delete daily rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_photo_scan(auth.uid(), '2026-10', 1000);
    raise exception 'signed-in user could call claim_photo_scan';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.daily_usage;
    raise exception 'anon could read daily_usage';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null
\echo 'ok   daily caps: own rows readable, no client writes, anon shut out'

-- 8. Deleting the account removes its daily rows.
do $$
begin
  delete from auth.users where id = '00000000-0000-4000-8000-000000000d01';
  if exists (select 1 from public.daily_usage where user_id = '00000000-0000-4000-8000-000000000d01') then
    raise exception 'account deletion left daily rows';
  end if;
end
$$;
\echo 'ok   daily caps: account deletion removes daily rows'

rollback;
\echo 'all daily caps checks passed'
