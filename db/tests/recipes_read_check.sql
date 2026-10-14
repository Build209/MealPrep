-- Checks for db/supabase/migrations/20261014080000_recipes_read_own.sql: a signed-in person reads
-- master recipes and their own recipes, never someone else's or an ownerless import; anon reads none.
-- Runs in one transaction and rolls back.

\set ON_ERROR_STOP on
\set QUIET on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000c3', 'c@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d4', 'd@example.test', '{}');

insert into public.recipes (name, is_master, created_by) values
  ('RRC master', true, null),
  ('RRC own', false, '00000000-0000-4000-8000-0000000000c3'),
  ('RRC other', false, '00000000-0000-4000-8000-0000000000d4'),
  ('RRC ownerless', false, null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true) \g /dev/null

do $$
declare
  seen text;
begin
  select string_agg(name, ',' order by name) into seen from public.recipes where name like 'RRC %';
  if seen is distinct from 'RRC master,RRC own' then
    raise exception 'signed-in user should see only master + own recipes, saw %', seen;
  end if;
end
$$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) \g /dev/null

do $$
declare
  n int;
begin
  begin
    select count(*) into n from public.recipes where name like 'RRC %';
  exception when insufficient_privilege then n := 0; -- no table grant at all is also fine
  end;
  if n <> 0 then raise exception 'anon should read no recipes, saw %', n; end if;
end
$$;

reset role;
rollback;
\echo 'ok   recipes: signed-in reads master + own only; anon reads none'
