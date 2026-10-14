-- DB hardening: user_id indexes, and no signed-out (anon) access to functions that do not need it.
--
-- NOT ON LIVE. File only. Applying it to live needs the owner's yes (charter).
-- Fixes the two notes in db/README.md ("Things noticed while reading live").
--
-- Live was read on 2026-10-14 with read-only catalog queries (pg_proc + has_function_privilege,
-- pg_default_acl, pg_indexes, pg_stat_user_tables). Live matched the baseline for every point below.
--
-- ---------------------------------------------------------------------------------------------
-- Part 1. Indexes on the per-user column of tables whose row level security filters on it.
-- ---------------------------------------------------------------------------------------------
-- Every per-user table in the baseline, and whether its user column already has a usable index:
--   pantry_items.user_id          NO  -> added (pantry_owner policy; FK cascade from profiles)
--   grocery_list_items.user_id    NO  -> added (grocery_owner policy; FK cascade from profiles)
--   store_deal_votes.user_id      NO  -> added (only (deal_id, user_id) unique, which leads with
--                                        deal_id; delete/update policies filter on user_id;
--                                        FK cascade from auth.users)
--   store_deals.reported_by       NO  -> added (insert/update/delete policies filter on it;
--                                        FK "on delete set null" from auth.users)
--   recipes.created_by            NO  -> added (the existing recipes_created_by_source_url_idx is
--                                        PARTIAL, "where source_url is not null", so it cannot serve
--                                        recipes_read / user update / delete for other rows;
--                                        FK "on delete set null" from profiles)
--   app_events, billing_subscriptions, meal_plan_items, user_favorite_stores, user_saved_recipes:
--                                     already indexed (index or unique key leading with user_id)
--   forky_chat_usage, photo_scan_usage, recipe_import_usage, photo_scan_requests, user_diet_prefs,
--   daily_usage (not on live):        primary key leads with user_id
--   billing_consents.user_id      NO, NOT added: RLS on with no policy (service role only), two rows
--                                     on live; only account deletion (FK set null) would use it.
--
-- Live row counts on 2026-10-14: pantry_items 35, recipes 48, grocery_list_items 0, store_deals 0,
-- store_deal_votes 0. At this size a plain CREATE INDEX takes milliseconds.
-- Owner's call: on a bigger live table, "create index concurrently if not exists" avoids blocking
-- writes while it builds. CONCURRENTLY cannot run inside a transaction (migrations run in one),
-- so it would have to be run statement by statement instead of through this file.

create index if not exists pantry_items_user_id_idx on public.pantry_items using btree (user_id);
create index if not exists grocery_list_items_user_id_idx on public.grocery_list_items using btree (user_id);
create index if not exists store_deal_votes_user_id_idx on public.store_deal_votes using btree (user_id);
create index if not exists store_deals_reported_by_idx on public.store_deals using btree (reported_by);
create index if not exists recipes_created_by_idx on public.recipes using btree (created_by);

-- ---------------------------------------------------------------------------------------------
-- Part 2. Function EXECUTE for signed-out callers (role anon) and PUBLIC.
-- ---------------------------------------------------------------------------------------------
-- Live today (read 2026-10-14): only three public functions are executable by anon:
-- is_admin, nearby_stores, search_creator_videos. All others are already service_role only or
-- authenticated + service_role. Decision per function (callers found in app/, mobile/ and the
-- edge functions in mobile/supabase/functions, read only):
--
-- REVOKED from anon:
--   search_creator_videos(text, integer)  SECURITY DEFINER full-text search. Callers: the new app
--       (app/src/data/creators.ts) as the signed-in person (the creators screen redirects to
--       sign-in when signed out), and the creator-videos edge function with the service role.
--       No signed-out caller. Revoking stops anyone with the public key from running unlimited
--       searches. It never had a PUBLIC grant. authenticated and service_role keep EXECUTE.
--
-- KEPT for anon (and why):
--   is_admin()  Used inside RLS policies that apply to every role ("to public"): profiles,
--       pantry_items, recipes, feature_flags, store_deals, and storage scan-training. Postgres
--       checks EXECUTE when a policy calls it, so revoking from anon (or PUBLIC) would turn a
--       signed-out read of those tables from "no rows" into "permission denied". It only reveals
--       whether the caller is an admin (always false for anon). PUBLIC grant also kept: the storage
--       and auth services may evaluate these policies under their own roles; not worth the risk.
--   nearby_stores(...)  SECURITY INVOKER, reads public.stores, which is public-read by policy
--       anyway. The live old app (mobile/lib/stores/supabaseNearbyStores.ts) has no sign-in gate on
--       its Stores tab, so signed-out people may call it today. Revisit at switch-over, when the
--       new app (sign-in required) replaces it.
--
-- Already not executable by anon on live (no change, listed for completeness):
--   Called by the new app as the signed-in person (authenticated + service_role):
--     tick_grocery_item, untick_grocery_item, add_missing_to_grocery, my_kitchen_weeks,
--     admin_analytics, admin_lookup_user_by_email, admin_scan_corrections_summary,
--     admin_set_user_plan, admin_set_user_role (admin_* also check is_admin() inside).
--   Called only by edge functions with the service role (service_role only):
--     claim_forky_message, settle_forky_message (ask-forky); claim_photo_scan, settle_photo_scan,
--     begin_photo_scan_request, finish_photo_scan_request (pantry-vision); claim_recipe_import,
--     refund_recipe_import (recipe-import); recompute_user_plan (stripe-webhook);
--     delete_user_owned_data (delete-user-account); try_acquire_viral_recipes_refresh_lock,
--     release_viral_recipes_refresh_lock, complete_viral_recipes_refresh_success,
--     complete_viral_recipes_refresh_failure (viral-recipes).
--   Trigger functions (EXECUTE is not checked when a trigger fires; service_role only):
--     app_events_daily_cap, enforce_profile_plan_change, enforce_profile_role_change,
--     handle_new_user, sync_role_to_jwt.
--   Not on live (20261014090000_daily_caps.sql): daily_cap_for, take_daily_use,
--     give_back_daily_use (no client role).
--
-- The "usage" screens read the allowance tables directly (select, own rows); there is no
-- usage function a signed-in person calls.

revoke execute on function public.search_creator_videos(text, integer) from public, anon;
grant execute on function public.search_creator_videos(text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Part 3. Future functions: stop handing EXECUTE to anon and PUBLIC by default.
-- ---------------------------------------------------------------------------------------------
-- Live default privileges (pg_default_acl, 2026-10-14): functions that role postgres creates in
-- schema public get EXECUTE for anon, authenticated and service_role, plus PUBLIC (Postgres's
-- built-in default). Migrations and the dashboard SQL editor run as postgres. Every new function
-- so far has had to revoke this itself (README note). After this, a new function is executable
-- by authenticated and service_role only, until a migration grants anon on purpose.
-- Not changed: defaults of role supabase_admin (postgres cannot change another role's defaults;
-- supabase_admin does not create app functions), and the default for authenticated (each
-- service-only function still revokes authenticated itself, as today).

alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
