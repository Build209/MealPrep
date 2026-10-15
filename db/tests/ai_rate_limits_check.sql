-- Checks for db/supabase/migrations/20261016000000_ai_rate_limits.sql: the limit is enforced,
-- counters are separate per account and per function, anonymous callers cannot run it, a signed-in
-- caller cannot read or write the table or pass someone else's id, bad input is refused, an earlier
-- window does not count (the window resets), old windows are cleaned up, and rows go with the
-- account. Runs in one transaction and rolls back.
--
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/tests/ai_rate_limits_check.sql

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- 1. Objects present and locked down.
do $$
declare
  f constant text := 'public.take_rate_limit(text, integer, integer)';
begin
  if to_regclass('public.ai_rate_limits') is null then raise exception 'table ai_rate_limits is missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ai_rate_limits'::regclass) then
    raise exception 'ai_rate_limits has row level security off';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_rate_limits') then
    raise exception 'ai_rate_limits should have no client policies';
  end if;
  if has_table_privilege('anon', 'public.ai_rate_limits', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.ai_rate_limits', 'select,insert,update,delete') then
    raise exception 'a client role has privileges on ai_rate_limits';
  end if;
  if to_regprocedure(f) is null then raise exception '% is missing', f; end if;
  if not (select prosecdef from pg_proc where oid = to_regprocedure(f)) then raise exception '% should be security definer', f; end if;
  if (select proconfig from pg_proc where oid = to_regprocedure(f)) is distinct from array['search_path=""'] then
    raise exception '% should set search_path to empty, has %', f, (select proconfig from pg_proc where oid = to_regprocedure(f));
  end if;
  if has_function_privilege('anon', f, 'execute') then raise exception 'anon can execute %', f; end if;
  if not has_function_privilege('authenticated', f, 'execute') then raise exception 'authenticated cannot execute %', f; end if;
  if exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = to_regprocedure(f) and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute %', f;
  end if;
end
$$;
\echo 'ok   rate limits: table with RLS, no policies, no client grants; function definer, empty search_path, signed-in only'

-- 2. Anonymous: refused.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) \g /dev/null
do $$
begin
  begin
    perform public.take_rate_limit('pantry-vision', 5, 60);
    raise exception 'anon ran take_rate_limit';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null
\echo 'ok   rate limits: anon refused'

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'rl-one@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000e2', 'rl-two@example.test', '{}');

-- 3. Limit enforced for one account and function; refusals do not add hits.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true) \g /dev/null
do $$
declare
  i int;
begin
  for i in 1..3 loop
    if not public.take_rate_limit('pantry-vision', 3, 60) then raise exception 'call % of 3 was refused', i; end if;
  end loop;
  if public.take_rate_limit('pantry-vision', 3, 60) then raise exception 'call 4 of 3 was allowed'; end if;
  if public.take_rate_limit('pantry-vision', 3, 60) then raise exception 'call 5 of 3 was allowed'; end if;

  -- Same account, another function: its own counter.
  if not public.take_rate_limit('recipe-import', 3, 60) then raise exception 'recipe-import refused after pantry-vision filled up'; end if;

  -- The table is out of reach for the caller.
  begin
    perform 1 from public.ai_rate_limits;
    raise exception 'a signed-in caller read ai_rate_limits';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ai_rate_limits;
    raise exception 'a signed-in caller deleted from ai_rate_limits';
  exception when insufficient_privilege then null;
  end;

  -- Bad input refused.
  begin
    perform public.take_rate_limit('made-up-function', 3, 60);
    raise exception 'unknown function name accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.take_rate_limit('pantry-vision', 0, 60);
    raise exception 'limit 0 accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.take_rate_limit('pantry-vision', 3, 7);
    raise exception 'window of 7 seconds accepted';
  exception when invalid_parameter_value then null;
  end;
end
$$;
\echo 'ok   rate limits: stops at the limit, refusals add nothing, per function, table out of reach, bad input refused'

-- 4. Another account: its own counter.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true) \g /dev/null
do $$
begin
  if not public.take_rate_limit('pantry-vision', 3, 60) then raise exception 'second account refused because of the first'; end if;
end
$$;

-- Signed in as the authenticated role but with no account id: refused.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true) \g /dev/null
do $$
begin
  begin
    perform public.take_rate_limit('pantry-vision', 3, 60);
    raise exception 'a call with no account id was counted';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null

-- Counts as stored (as the owner): first account 3 (not 5) for pantry-vision, 1 for recipe-import;
-- second account 1.
do $$
declare
  n int;
begin
  select hits into n from public.ai_rate_limits where user_id = '00000000-0000-4000-8000-0000000000e1' and fn = 'pantry-vision';
  if n is distinct from 3 then raise exception 'first account pantry-vision hits should be 3, found %', n; end if;
  select hits into n from public.ai_rate_limits where user_id = '00000000-0000-4000-8000-0000000000e1' and fn = 'recipe-import';
  if n is distinct from 1 then raise exception 'first account recipe-import hits should be 1, found %', n; end if;
  select hits into n from public.ai_rate_limits where user_id = '00000000-0000-4000-8000-0000000000e2' and fn = 'pantry-vision';
  if n is distinct from 1 then raise exception 'second account hits should be 1, found %', n; end if;
end
$$;
\echo 'ok   rate limits: separate per account; a call with no account id is refused'

-- 5. Window resets: a full earlier window does not count against the current one, and windows
-- older than a day are removed when the caller starts a new window.
delete from public.ai_rate_limits where user_id = '00000000-0000-4000-8000-0000000000e2';
insert into public.ai_rate_limits (user_id, fn, window_start, hits) values
  ('00000000-0000-4000-8000-0000000000e2', 'recipe-import',
   to_timestamp(floor(extract(epoch from clock_timestamp()) / 60) * 60) - interval '1 minute', 3),
  ('00000000-0000-4000-8000-0000000000e2', 'recipe-import', clock_timestamp() - interval '2 days', 3),
  ('00000000-0000-4000-8000-0000000000e1', 'recipe-import', clock_timestamp() - interval '2 days', 3);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true) \g /dev/null
do $$
begin
  if not public.take_rate_limit('recipe-import', 3, 60) then
    raise exception 'a full earlier window blocked the current one';
  end if;
end
$$;
reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null

do $$
declare
  n int;
begin
  select count(*) into n from public.ai_rate_limits
   where user_id = '00000000-0000-4000-8000-0000000000e2' and window_start < clock_timestamp() - interval '1 day';
  if n <> 0 then raise exception 'old windows of the caller were not cleaned up'; end if;
  select count(*) into n from public.ai_rate_limits
   where user_id = '00000000-0000-4000-8000-0000000000e2' and fn = 'recipe-import';
  if n <> 2 then raise exception 'expected previous and current minute rows, found %', n; end if;
  -- Other accounts' rows are not touched by someone else's call.
  select count(*) into n from public.ai_rate_limits
   where user_id = '00000000-0000-4000-8000-0000000000e1' and window_start < clock_timestamp() - interval '1 day';
  if n <> 1 then raise exception 'another account''s old row was removed by a different caller'; end if;
end
$$;
\echo 'ok   rate limits: a new window starts fresh; the caller''s windows older than a day are removed'

-- 6. Deleting the account removes its rows.
delete from auth.users where id = '00000000-0000-4000-8000-0000000000e1';
do $$
begin
  if exists (select 1 from public.ai_rate_limits where user_id = '00000000-0000-4000-8000-0000000000e1') then
    raise exception 'rate limit rows outlived the account';
  end if;
end
$$;
\echo 'ok   rate limits: rows go with the account'

rollback;
