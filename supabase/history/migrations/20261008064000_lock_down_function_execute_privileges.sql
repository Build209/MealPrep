-- Lock down EXECUTE privileges on SECURITY DEFINER functions in the public schema.
-- Already applied to the live project (okkwapgyadpaifpmkcex); kept here so the repo
-- matches the database. Idempotent: REVOKE is safe to run again.
--
-- Left unchanged on purpose:
--   public.is_admin()              used inside RLS policies that apply to anon
--   public.search_creator_videos() public search used by the creator-videos function

-- Admin RPCs: signed-in admins only (each function also checks is_admin() internally).
revoke execute on function public.admin_analytics() from public, anon;
revoke execute on function public.admin_lookup_user_by_email(text) from public, anon;
revoke execute on function public.admin_scan_corrections_summary(integer) from public, anon;
revoke execute on function public.admin_set_user_plan(uuid, public.user_plan) from public, anon;
revoke execute on function public.admin_set_user_role(uuid, public.user_role) from public, anon;

-- Trigger functions: never meant to be called through the REST API.
-- Triggers still fire normally; EXECUTE is not checked when a trigger fires.
revoke execute on function public.enforce_profile_plan_change() from public, anon, authenticated;
revoke execute on function public.enforce_profile_role_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_role_to_jwt() from public, anon, authenticated;
