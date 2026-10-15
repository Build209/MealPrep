-- Security hardening from the 2026-10-15 audit: scan_corrections writes are bounded and tied to the
-- caller's own training photo; is_admin() EXECUTE is deliberately left as it is (see Part 1).
--
-- NOT on live. Needs the owner's yes before it is applied (charter). Checked by
-- db/tests/security_hardening_check.sql on a local database only.
--
-- Live was read on 2026-10-15 with read-only queries: scan_corrections has 15 rows; longest values
-- scan_id 36, ai_name 25, user_name 13, storage_location 6, model 16, training_photo_path 84;
-- at most 14 rows on any one day and 12 for any one scan. Every limit below is far above that, so
-- the new CHECK constraints validate against the existing rows.
--
-- ---------------------------------------------------------------------------------------------
-- Part 1. is_admin(): EXECUTE for anon and PUBLIC is KEPT (no change).
-- ---------------------------------------------------------------------------------------------
-- is_admin() is SECURITY DEFINER and only answers "is the caller an admin" (always false for anon,
-- which has no auth.uid()). It is called inside these RLS policies, which apply "to public" and are
-- therefore evaluated for signed-out (anon) requests too:
--   feature_flags_admin_write, pantry_admin_read, profiles_admin_all, profiles_select_self,
--   recipes_admin_write, store_deals_admin_delete (public schema), plus storage
--   scan_training_admin_select (authenticated only).
-- Postgres checks EXECUTE on functions a policy calls, so revoking it from anon (or PUBLIC, which
-- anon inherits) turns a signed-out read of profiles / pantry_items / recipes / feature_flags /
-- store_deals from "no rows" into "permission denied for function is_admin". The live old app
-- (main) reads some of those signed out. 20261014100000_db_hardening.sql made the same call and
-- db/tests/db_hardening_check.sql asserts it. The admin_* RPCs are already authenticated-only and
-- check is_admin() inside. Making the revoke safe would mean rewriting those six policies to
-- "to authenticated"; proposed for switch-over (the new app requires sign-in), not done here.
--
-- ---------------------------------------------------------------------------------------------
-- Part 2. scan_corrections: bounded rows, own training photo only, daily cap per person.
-- ---------------------------------------------------------------------------------------------
-- Writers (searched app/, mobile/ on main, supabase/functions): only the OLD app on main inserts,
-- mobile/lib/scanCorrections/client.ts logScanCorrectionsInBackground: a fire-and-forget batch
-- insert (no .select() afterwards) of rows {scan_id, kind, ai_name, user_name, storage_location,
-- model, training_photo_path} after a pantry scan review. A scan returns at most 120 items
-- (mobile/lib/pantryVision/detectionParse.ts), so one save writes at most ~120 rows plus manual adds.
-- training_photo_path is what mobile/config/scanTraining.ts buildScanTrainingObjectPath returns:
-- "<auth uid>/pantry/<scan id>.jpg" in bucket scan-training (whose insert policy already requires
-- the first folder to be auth.uid()). The new app (app/) never writes this table. No edge function
-- does. Admins read it through admin_scan_corrections_summary (SECURITY DEFINER; unaffected).
--
-- The table is described as anonymous scan feedback, so this migration does NOT add a user_id
-- column to it. The per-person daily cap counts in a separate service-only table instead.
-- What the old app sends keeps working unchanged: every row it writes passes the checks below.
--
-- 2a. Size limits (CHECK constraints; existing rows all pass).
alter table public.scan_corrections
  add constraint scan_corrections_scan_id_len check (char_length(scan_id) between 1 and 64),
  add constraint scan_corrections_ai_name_len check (ai_name is null or char_length(ai_name) <= 200),
  add constraint scan_corrections_user_name_len check (user_name is null or char_length(user_name) <= 200),
  add constraint scan_corrections_storage_location_len check (storage_location is null or char_length(storage_location) <= 32),
  add constraint scan_corrections_model_len check (model is null or char_length(model) <= 100),
  add constraint scan_corrections_training_photo_path_len check (training_photo_path is null or char_length(training_photo_path) <= 300);

-- 2b. Insert policy: was WITH CHECK (true). Same name, same role (authenticated); now requires a
-- signed-in caller, and a training photo path (when given) must be in the caller's own folder,
-- so nobody can attach another person's photo path to feedback rows.
drop policy if exists scan_corrections_insert_authenticated on public.scan_corrections;
create policy scan_corrections_insert_authenticated on public.scan_corrections as permissive for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (training_photo_path is null or split_part(training_photo_path, '/', 1) = (select auth.uid())::text)
  );

-- 2c. Daily cap: at most 1000 rows per person per UTC day (about 8 full 120-item scans). Rows over
-- the cap are skipped silently (the trigger returns null), like app_events_daily_cap, so the old
-- app's background insert never shows an error. Inserts with no auth.uid() (service role, SQL
-- editor) are not capped.
create table public.scan_correction_daily_counts (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  rows_logged integer not null default 0,
  primary key (user_id, day)
);
comment on table public.scan_correction_daily_counts is
  'Per-person daily count of scan_corrections rows, for the 1000/day cap. Service only; keeps scan_corrections itself unattributed.';
alter table public.scan_correction_daily_counts enable row level security;
-- No policies: only the trigger below (SECURITY DEFINER) and the service role touch it.
revoke all on public.scan_correction_daily_counts from public, anon, authenticated;
grant all on public.scan_correction_daily_counts to service_role;

create or replace function public.scan_corrections_daily_cap()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if v_uid is null then
    return new;
  end if;
  insert into public.scan_correction_daily_counts as c (user_id, day, rows_logged)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set rows_logged = c.rows_logged + 1
  returning c.rows_logged into v_count;
  if v_count > 1000 then
    return null;
  end if;
  return new;
end;
$function$;

revoke all on function public.scan_corrections_daily_cap() from public, anon, authenticated;
grant execute on function public.scan_corrections_daily_cap() to service_role;

create trigger scan_corrections_daily_cap before insert on public.scan_corrections
  for each row execute function public.scan_corrections_daily_cap();

-- ---------------------------------------------------------------------------------------------
-- Not in this file (decided against for now; see the pull request):
--   * An 18+ check on auth.users (reject email sign-ups without an age flag in the metadata).
--     The old app on main (mobile/context/AppContext.tsx signUpWithPassword) sends only
--     {name} in options.data, so a hard trigger would block every old-app sign-up today. The new
--     app now sends age_confirmed / age_confirmed_at; apply the trigger at switch-over.
-- ---------------------------------------------------------------------------------------------
