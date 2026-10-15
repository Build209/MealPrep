-- RLS performance: call auth.uid() / auth.role() / is_admin() once per query, not once per row,
-- and index the two foreign keys the Supabase performance advisor lists as unindexed.
--
-- NOT on live. Owner approval needed before live (charter: any live database change needs the
-- owner's yes).
--
-- Who can see what does NOT change. Every policy keeps its name, command, roles and permissive
-- mode (ALTER POLICY without TO keeps the roles); only the expression is rewritten so that
--   auth.uid()   -> (select auth.uid())
--   auth.role()  -> (select auth.role())
--   is_admin()   -> (select public.is_admin())
-- The wrapped call has no row inputs, so Postgres runs it once per statement (an "initPlan")
-- and reuses the value; the result for every row is the same as before. A USING-only policy stays
-- USING-only and a WITH CHECK-only policy stays WITH CHECK-only, exactly as on live.
--
-- Source of the list (read-only, 2026-10-15): Supabase performance advisor on project
-- okkwapgyadpaifpmkcex ("auth_rls_initplan": 29 policies; "unindexed_foreign_keys": 2) and
-- SELECT ... FROM pg_policies on live. Live matched the baseline file for every policy below.
-- Policies changed by later files in this folder use their newest definition:
--   recipes_read (20261014080000_recipes_read_own.sql)      already (select auth.uid()) -> skipped
--   scan_corrections_insert_authenticated
--                (20261015000000_security_hardening.sql)    already wrapped              -> skipped
--   app_events_insert_own / app_events_select_own (baseline) already wrapped              -> skipped
--   daily_usage_select_own (20261014090000_daily_caps.sql)   already wrapped              -> skipped
--   ai_rate_limits (20261016000000_ai_rate_limits.sql)       no policies                  -> nothing to do
--
-- Not changed here (noted for the owner):
--   * "multiple permissive policies" (41 advisor findings on feature_flags, pantry_items, profiles,
--     recipes, store_deals). Merging them means rewriting who-can-do-what per command (several
--     are FOR ALL to public mixed with per-command policies), which is not trivially safe. With
--     is_admin() now evaluated once per query, the extra policy costs very little. Left as is.
--   * storage.objects policies (avatars, scan-photos, ...) also call auth.uid() per row, but the
--     advisor does not list them and storage.objects is owned by Supabase's storage role.
--   * 5 "unused index" findings (INFO): unused only because traffic is tiny. Kept.

-- ---------------------------------------------------------------------------------------------
-- Part 1. 29 policies flagged by the advisor (auth.uid() / auth.role() per row).
-- ---------------------------------------------------------------------------------------------

-- billing_subscriptions (SELECT to authenticated)
alter policy billing_subscriptions_select_self on public.billing_subscriptions
  using ((select auth.uid()) = user_id);

-- feature_flags (SELECT to public)
alter policy feature_flags_read on public.feature_flags
  using ((select auth.role()) = 'authenticated'::text);

-- forky_chat_usage (SELECT to authenticated)
alter policy forky_chat_usage_select_own on public.forky_chat_usage
  using (user_id = (select auth.uid()));

-- grocery_list_items (ALL to public, USING only)
alter policy grocery_owner on public.grocery_list_items
  using ((select auth.uid()) = user_id);

-- meal_plan_items
alter policy meal_plan_delete_own on public.meal_plan_items
  using ((select auth.uid()) = user_id);
alter policy meal_plan_insert_own on public.meal_plan_items
  with check ((select auth.uid()) = user_id);
alter policy meal_plan_select_own on public.meal_plan_items
  using ((select auth.uid()) = user_id);
alter policy meal_plan_update_own on public.meal_plan_items
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- pantry_items (ALL to public, USING only)
alter policy pantry_owner on public.pantry_items
  using ((select auth.uid()) = user_id);

-- photo_scan_usage (SELECT to authenticated)
alter policy photo_scan_usage_select_own on public.photo_scan_usage
  using (user_id = (select auth.uid()));

-- profiles
alter policy profiles_select_self on public.profiles
  using (((select auth.uid()) = id) or (select public.is_admin()));
alter policy profiles_update_self on public.profiles
  using ((select auth.uid()) = id);

-- recipe_import_usage (SELECT to authenticated)
alter policy recipe_import_usage_select_own on public.recipe_import_usage
  using (user_id = (select auth.uid()));

-- recipes (recipes_read already wrapped by 20261014080000_recipes_read_own.sql)
alter policy recipes_user_delete on public.recipes
  using (((select auth.uid()) = created_by) and (is_master = false));
alter policy recipes_user_insert on public.recipes
  with check (((select auth.uid()) = created_by) and (is_master = false));
alter policy recipes_user_update on public.recipes
  using (((select auth.uid()) = created_by) and (is_master = false))
  with check (((select auth.uid()) = created_by) and (is_master = false));

-- store_deal_votes
alter policy store_deal_votes_delete on public.store_deal_votes
  using ((select auth.uid()) = user_id);
alter policy store_deal_votes_insert on public.store_deal_votes
  with check (((select auth.uid()) = user_id) and (not (exists (
    select 1 from public.store_deals d
    where d.id = store_deal_votes.deal_id and d.reported_by = (select auth.uid())))));
alter policy store_deal_votes_read on public.store_deal_votes
  using ((select auth.role()) = 'authenticated'::text);
alter policy store_deal_votes_update on public.store_deal_votes
  using ((select auth.uid()) = user_id)
  with check (((select auth.uid()) = user_id) and (not (exists (
    select 1 from public.store_deals d
    where d.id = store_deal_votes.deal_id and d.reported_by = (select auth.uid())))));

-- store_deals
alter policy store_deals_delete_own on public.store_deals
  using ((select auth.uid()) = reported_by);
alter policy store_deals_insert on public.store_deals
  with check ((select auth.uid()) = reported_by);
alter policy store_deals_read on public.store_deals
  using ((select auth.role()) = 'authenticated'::text);
alter policy store_deals_update_own on public.store_deals
  using ((select auth.uid()) = reported_by)
  with check ((select auth.uid()) = reported_by);

-- user_diet_prefs
alter policy user_diet_prefs_insert on public.user_diet_prefs
  with check ((select auth.uid()) = user_id);
alter policy user_diet_prefs_select on public.user_diet_prefs
  using ((select auth.uid()) = user_id);
alter policy user_diet_prefs_update on public.user_diet_prefs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- user_favorite_stores, user_saved_recipes (ALL to public)
alter policy user_favorite_stores_owner on public.user_favorite_stores
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy user_saved_recipes_owner on public.user_saved_recipes
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- Part 2. 7 policies that call is_admin() per row (not in the advisor's list, which only looks
-- for auth.* and current_setting; is_admin() looks up the caller's profile on every row).
-- is_admin() takes no arguments and is STABLE, so once per query gives the same answer.
-- ---------------------------------------------------------------------------------------------

alter policy feature_flags_admin_write on public.feature_flags
  using ((select public.is_admin()));
alter policy pantry_admin_read on public.pantry_items
  using ((select public.is_admin()));
alter policy profiles_admin_all on public.profiles
  using ((select public.is_admin()));
alter policy recipes_admin_master_all on public.recipes
  using ((select public.is_admin()) and is_master)
  with check ((select public.is_admin()) and is_master);
alter policy recipes_admin_write on public.recipes
  using ((select public.is_admin()));
alter policy scan_corrections_admin_select on public.scan_corrections
  using ((select public.is_admin()));
alter policy store_deals_admin_delete on public.store_deals
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- Part 3. The 2 unindexed foreign keys from the advisor.
-- ---------------------------------------------------------------------------------------------
-- billing_consents.user_id -> profiles(id) on delete set null. (db_hardening skipped it: service
--   role only, 2 rows. Added now because the advisor flags it and it costs nothing.)
-- user_saved_recipes.kitchen_recipe_id -> recipes(id) on delete set null: deleting a recipe
--   otherwise scans all saved recipes.
-- Both tables are tiny on live, so a plain CREATE INDEX takes milliseconds. On a big table use
-- CREATE INDEX CONCURRENTLY statement by statement instead (cannot run inside a migration).
create index if not exists billing_consents_user_id_idx
  on public.billing_consents using btree (user_id);
create index if not exists user_saved_recipes_kitchen_recipe_id_idx
  on public.user_saved_recipes using btree (kitchen_recipe_id);
