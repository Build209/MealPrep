-- Checks for 20261020000000_utensils_equipment.sql (on live since 2026-10-17): the five new tables and
-- their RLS, the seed counts, the recipe columns, and who can read and write what. Rolls back.
\set ON_ERROR_STOP on
begin;

do $$
declare n int;
begin
  select count(*) into n from public.equipment;
  if n <> 28 then raise exception 'expected 28 equipment rows, found %', n; end if;
  select count(*) into n from public.equipment_swaps;
  if n <> 8 then raise exception 'expected 8 swap rules, found %', n; end if;
  select count(*) into n from public.equipment where category not in ('heat','pots_pans','tools','eating');
  if n <> 0 then raise exception 'equipment row with unknown category'; end if;
  select count(*) into n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and c.relname in ('equipment','user_equipment','equipment_swaps','equipment_requests','recipe_adaptations') and c.relrowsecurity;
  if n <> 5 then raise exception 'expected RLS on all 5 utensils tables, found % with RLS', n; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public'
    and table_name in ('library_recipes','recipes') and column_name in ('equipment_required','equipment_tagged_at','equipment_tag_source');
  if n <> 6 then raise exception 'expected 6 equipment columns on the recipe tables, found %', n; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public'
    and table_name = 'profiles' and column_name = 'equipment_set_at';
  if n <> 1 then raise exception 'profiles.equipment_set_at missing'; end if;
  -- Untagged means empty list AND no tagged date, on every existing recipe.
  select count(*) into n from public.library_recipes where equipment_tagged_at is not null or equipment_required <> '{}';
  if n <> 0 then raise exception 'existing library recipes should be untagged'; end if;
end $$;
\echo 'ok   utensils: 5 tables with RLS, 28 equipment, 8 swaps, recipe columns, nothing tagged'

-- Live (and `supabase db start`) give new public tables Supabase's default grants to anon and authenticated,
-- so only RLS decides who sees what. A bare Postgres has no such defaults: give them here (rolled back)
-- so the RLS checks below mean the same thing everywhere.
grant select, insert, update, delete on public.equipment, public.user_equipment, public.equipment_swaps,
  public.equipment_requests, public.recipe_adaptations to anon, authenticated;
grant select on public.library_recipes, public.profiles to anon, authenticated;

-- Two accounts. Each sees only their own picks; reference tables are readable; requests and drafts are not.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'utensil-a@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'utensil-b@example.test');

insert into public.user_equipment (user_id, equipment_slug) values
  ('00000000-0000-0000-0000-0000000000e1', 'air_fryer'),
  ('00000000-0000-0000-0000-0000000000e2', 'oven');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$
declare n int; blocked boolean := false;
begin
  select count(*) into n from public.user_equipment;
  if n <> 1 then raise exception 'a member should see only their own pick, saw %', n; end if;
  select count(*) into n from public.equipment;
  if n <> 28 then raise exception 'signed-in members should read the 28 equipment rows, saw %', n; end if;
  begin
    insert into public.user_equipment (user_id, equipment_slug) values ('00000000-0000-0000-0000-0000000000e2', 'wok');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'a member added gear to another account'; end if;
  begin
    perform 1 from public.equipment_requests;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'members should see no typed-gear counts'; end if;
  exception when insufficient_privilege then null; end;
  begin
    insert into public.equipment_requests (raw_text) values ('sous vide');
    raise exception 'a member wrote to equipment_requests';
  exception when insufficient_privilege or check_violation or others then
    if sqlerrm like 'a member wrote%' then raise; end if;
  end;
end $$;
reset role;

-- Drafts are hidden, approved adaptations are readable.
insert into public.library_recipes (id, slug, title, dish_name)
  values ('00000000-0000-0000-0000-0000000000f1', 'utensils-check-recipe', 'Utensils check recipe', 'Utensils check');
insert into public.recipe_adaptations (library_recipe_id, for_equipment, steps, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'air_fryer', '[]', 'draft'),
  ('00000000-0000-0000-0000-0000000000f1', 'toaster_oven', '[]', 'approved');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.recipe_adaptations;
  if n <> 1 then raise exception 'members should see only approved adaptations, saw %', n; end if;
end $$;
reset role;

-- Signed out: reference lists readable, personal and server-only tables not.
set local role anon;
do $$
declare n int; blocked boolean := false;
begin
  select count(*) into n from public.equipment;
  if n <> 28 then raise exception 'signed-out visitors should read the equipment list, saw %', n; end if;
  begin perform 1 from public.user_equipment; exception when insufficient_privilege then blocked := true; end;
  if not blocked then
    get diagnostics n = row_count;
    select count(*) into n from public.user_equipment;
    if n <> 0 then raise exception 'signed-out visitors can read user_equipment'; end if;
  end if;
end $$;
reset role;
\echo 'ok   utensils: own picks only, drafts hidden, reference lists readable, typed-gear counts server-only'

rollback;
