# db: the live database, as a file

Rebuild spec v1, phase 0, step 1. The repo's 50 files in `mobile/supabase/migrations` no longer
match the live database (the live project lists only 8 recorded migrations, and several tables and
functions were made by hand). This folder holds one baseline file read from the live schema, so the
new app's tests run against what is actually live.

| Path | What it is |
|---|---|
| `supabase/migrations/20261013000000_live_baseline.sql` | The live schema of project `okkwapgyadpaifpmkcex`, read 2026-10-13 with read-only catalog queries. Public schema (29 tables, 28 functions, 46 policies, grants, triggers, comments), the trigger on `auth.users`, 5 storage buckets with 13 policies, 2 scheduled jobs. No data, no secrets. |
| `supabase/config.toml` | Local Supabase settings for CI (PostgreSQL 17, like live). Local only: email confirmation off and unused services off, for the app's end-to-end tests (`.github/workflows/app-e2e.yml`). Never the live project's settings. |
| `tests/baseline_check.sql` | Checks: structure counts, sign-up makes a free member, members cannot raise their own plan or role, each user sees only their own rows, allowance counters are server-only and stop at the limit, the plan follows the Stripe row, deleting an account removes kitchen data. Rolls back; leaves nothing. |
| `supabase/migrations/20261014000000_grocery_tick.sql` | **On live since 2026-10-14 (owner's yes).** `tick_grocery_item` / `untick_grocery_item`: tick a grocery row into the pantry (or undo it) in one transaction, for the new app's Grocery tab. |
| `tests/grocery_tick_check.sql` | Checks for those two functions: adds to the pantry once, undo reverses once, units never mix, other people's rows out of reach, anon refused. Rolls back. |
| `supabase/migrations/20261014030000_add_missing_to_grocery.sql` | On live since 2026-10-14 (owner's yes). `add_missing_to_grocery`: puts a recipe's missing ingredients on the grocery list in one transaction, adding to an open row of the same thing and unit, once per recipe. For the new app's recipe detail screen. |
| `tests/add_missing_check.sql` | Checks for that function: merges into open rows of the same unit, ticked rows untouched, a repeat call adds nothing, a second recipe adds once, other people's lists out of reach, anon refused. Rolls back. |
| `supabase/migrations/20261014090000_daily_caps.sql` | **Not on live; needs the owner's yes and compliance review (terms update, rule 11).** Daily caps on paid plans (spec section 4): table `daily_usage` and new bodies for the six claim/settle/refund allowance functions (same signatures). A daily refusal returns -2, which the deployed edge functions already treat as refused. |
| `tests/daily_caps_check.sql` | Checks for daily caps: each tier stops at its cap with monthly room left, free uncapped, admin = Family, comped follows its tier, new Pacific day resets, refunds return one, own rows only, anon refused. Rolls back. |
| `supabase/migrations/20261014100000_db_hardening.sql` | **Not on live; needs the owner's yes.** `user_id` indexes on pantry, grocery, deal votes, deals (`reported_by`) and recipes (`created_by`); `search_creator_videos` no longer callable signed out; new functions made by `postgres` no longer get EXECUTE for `anon` or PUBLIC by default. Header lists every function with its decision. |
| `tests/db_hardening_check.sql` | Checks for that file: the indexes exist, anon can run only `is_admin` and `nearby_stores`, no PUBLIC grants except `is_admin`, signed-in and service-role callers keep their functions, signed-out reads of tables whose policies call `is_admin()` still work, a new function gets no anon/PUBLIC EXECUTE. Rolls back. |
| `supabase/migrations/20261016000000_ai_rate_limits.sql` | **NOT on live — owner approval needed before live.** Per-minute limits for the AI/search edge functions kept in the database instead of each function copy's memory: table `ai_rate_limits` (RLS on, no client access, rows go with the account) and `take_rate_limit(fn, limit, window_seconds)` (signed-in only, counts `auth.uid()`, atomic). Edge functions fall back to the in-memory limit until it is on live. |
| `tests/ai_rate_limits_check.sql` | Checks for that file: stops at the limit, separate per account and per function, anon refused, table out of client reach, bad input refused, a new window starts fresh, old windows cleaned up, rows go with the account. Rolls back. |
| `supabase/migrations/20261015000000_security_hardening.sql` | **NOT on live — needs the owner's yes.** Security audit 2026-10-15: `scan_corrections` gets size limits on its text columns, an insert policy that requires a signed-in caller and a training photo path in the caller's own folder (was `with check (true)`), and a 1000 rows/person/UTC day cap (extra rows skipped silently) counted in a new service-only table `scan_correction_daily_counts` (the feedback table stays unattributed). `is_admin()` EXECUTE for anon is deliberately kept (RLS policies that anon evaluates call it). Rows the old app sends still insert. |
| `tests/security_hardening_check.sql` | Checks for that file: limits, policy and trigger exist; old-app rows insert; another person's photo path, oversized or empty values and anon inserts refused; the 1000th row is the last kept; members cannot read the counters; account deletion removes them; anon keeps `is_admin`. Rolls back. |
| `supabase/migrations/20261017000000_rls_perf.sql` | **NOT on live — owner approval needed before live.** Supabase performance advisor fixes (2026-10-15): 36 public RLS policies rewritten to call `auth.uid()` / `auth.role()` / `is_admin()` once per query as `(select ...)` (29 flagged by the advisor + 7 `is_admin()` ones), same names, commands, roles and logic; indexes on the two unindexed foreign keys `billing_consents.user_id` and `user_saved_recipes.kitchen_recipe_id`. Multiple-permissive-policy warnings and storage policies left as they are (header says why). |
| `tests/rls_perf_check.sql` | Checks for that file: no public policy calls those functions per row, each altered policy keeps its command and roles and uses the `(select ...)` form, both indexes exist, a user sees and changes only own pantry, grocery, profile and recipe rows, an admin still reads all pantry items and profiles, anon sees none of them. Rolls back. |
| `supabase/migrations/20261020000000_utensils_equipment.sql` | **On live since 2026-10-17** (applied by the manager session on the owner's say-so as `utensils_equipment_schema` + `utensils_equipment_seed`; this file is those two joined, so CI tests what is live; never apply it to live again). Equipment picker and smart recipe matching, additive only: tables `equipment` (28 rows), `equipment_swaps` (8), `user_equipment`, `equipment_requests` (service-only), `recipe_adaptations` (approved rows only visible); `profiles.equipment_set_at`; gear-tag columns on `library_recipes` and `recipes`. No app code uses them yet and no recipe is tagged. |
| `tests/utensils_check.sql` | Checks for that file: counts and RLS on all five tables, recipe columns, nothing tagged, members see only their own gear, drafts hidden, reference lists readable, typed-gear counts out of reach. Rolls back. |
| `tests/plain-postgres-stubs.sql` | Small stand-ins for Supabase's `auth` and `storage` schemas, to run the checks on a bare Postgres with no Docker. |
| `scripts/wikibooks/` + `data/wikibooks-recipes.json` | Manual loader for Wikibooks Cookbook recipes into `library_recipes` as drafts only (parser, loader, tests; workflow `load-wikibooks-recipes.yml`). Not run by CI; touches the live database only when the owner runs the workflow. See `scripts/wikibooks/README.md`. |
| `scripts/check-baseline.sh` | Applies the baseline if needed, then runs the checks. Refuses hosted Supabase URLs. |

CI: `.github/workflows/db-baseline.yml` starts a local Supabase database (`supabase db start --workdir db`)
and runs the checks on every pull request that touches `db/`.

Run it yourself:

```bash
# With Docker and the Supabase CLI
supabase db start --workdir db
DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres db/scripts/check-baseline.sh

# With only a local Postgres (PostGIS optional)
createdb scratch && DB_URL=postgresql:///scratch db/scripts/check-baseline.sh --plain
```

## Later migrations and whether they are on live

| File | On live? |
|---|---|
| `20261014000000_grocery_tick.sql` | Yes, 2026-10-14 (owner's yes). Live function bodies omit the in-body comments. |
| `20261014030000_add_missing_to_grocery.sql` | Yes, 2026-10-14 (owner's yes). |
| `20261014080000_recipes_read_own.sql` | Yes, 2026-10-14 (owner's yes): signed-in people read master + own recipes only. |
| `20261014090000_daily_caps.sql` | No. Needs the owner's yes and compliance review. |
| `20261014100000_db_hardening.sql` | Yes, 2026-10-14 (owner's yes). |
| `20261014110000_scan_photo_retention.sql` | Yes, 2026-10-14 (owner's yes): #260, daily job `scan-photos-retention-daily` at 10:23 UTC. |
| `20261016000000_ai_rate_limits.sql` | **No — NOT on live, owner approval needed before live.** Apply before (or after) deploying the edge functions; they work either way. |
| `20261015000000_security_hardening.sql` | **NOT on live — needs the owner's yes.** scan_corrections limits, own-photo insert policy and daily cap. |
| `20261017000000_rls_perf.sql` | **No — NOT on live, owner approval needed before live.** RLS policies called once per query, two foreign-key indexes. No change to who sees what. |
| `20261020000000_utensils_equipment.sql` | **Yes, 2026-10-17** (owner's say-so, applied by the manager session). Recorded on live as two migrations; this file joins them. |

## Rules

- **Never apply the baseline to the live project.** Everything in it already exists there.
- New database changes go in new, dated files in `db/supabase/migrations`, after the baseline.
  Applying one to live needs the owner's yes (charter).
- The old `mobile/supabase/migrations` moved to `supabase/history/migrations` at the switch-over; it is history, not the source of truth.
- If live changes outside this folder (a hand-made change in the dashboard), re-read it and add a
  migration here, so this folder and live stay the same.

## How it was checked against live (2026-10-13)

The same fingerprint queries ran on live and on a database built from this file. Identical:
all 28 function definitions (byte for byte, ignoring Windows line endings), all 82 constraints,
all 59 policies (public and storage), 5 triggers, 21 comments, every column except `stores.geom`,
every index except `stores_geom_gist_idx`, and table grants. Those two were not compared locally
because the test machine had no PostGIS; CI builds them with PostGIS.

## Things noticed while reading live (not changed here)

- New functions get EXECUTE for `anon` and `authenticated` by default (Supabase's default
  privileges). Every new `security definer` function must revoke it explicitly, as the existing
  ones do. **File ready, not live:** `20261014100000_db_hardening.sql` (anon and PUBLIC only).
- `meal_plan_items.leftover_of_id` and `linked_leftover_id` have no foreign key.
- `pantry_items` and `grocery_list_items` have no index on `user_id` (fine at today's size).
  **File ready, not live:** `20261014100000_db_hardening.sql` (plus three more per-user columns).
- `delete_user_owned_data` does not clear `user_saved_recipes` or `user_diet_prefs` itself;
  both are removed anyway by cascades when the auth user is deleted.
