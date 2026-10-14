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
| `supabase/migrations/20261014000000_grocery_tick.sql` | **Not on live yet; needs the owner's yes.** `tick_grocery_item` / `untick_grocery_item`: tick a grocery row into the pantry (or undo it) in one transaction, for the new app's Grocery tab. |
| `tests/grocery_tick_check.sql` | Checks for those two functions: adds to the pantry once, undo reverses once, units never mix, other people's rows out of reach, anon refused. Rolls back. |
| `supabase/migrations/20261014030000_add_missing_to_grocery.sql` | **Not on live yet; needs the owner's yes.** `add_missing_to_grocery`: puts a recipe's missing ingredients on the grocery list in one transaction, adding to an open row of the same thing and unit, once per recipe. For the new app's recipe detail screen. |
| `tests/add_missing_check.sql` | Checks for that function: merges into open rows of the same unit, ticked rows untouched, a repeat call adds nothing, a second recipe adds once, other people's lists out of reach, anon refused. Rolls back. |
| `tests/plain-postgres-stubs.sql` | Small stand-ins for Supabase's `auth` and `storage` schemas, to run the checks on a bare Postgres with no Docker. |
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
| `20261014030000_add_missing_to_grocery.sql` | No. Needs the owner's yes. |
| `20261014080000_recipes_read_own.sql` | Yes, 2026-10-14 (owner's yes): signed-in people read master + own recipes only. |

## Rules

- **Never apply the baseline to the live project.** Everything in it already exists there.
- New database changes go in new, dated files in `db/supabase/migrations`, after the baseline.
  Applying one to live needs the owner's yes (charter).
- The old `mobile/supabase/migrations` stays as it is until switch-over; it is history, not the source of truth.
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
  ones do. Worth a default-privileges change later, with the owner's yes.
- `meal_plan_items.leftover_of_id` and `linked_leftover_id` have no foreign key.
- `pantry_items` and `grocery_list_items` have no index on `user_id` (fine at today's size).
- `delete_user_owned_data` does not clear `user_saved_recipes` or `user_diet_prefs` itself;
  both are removed anyway by cascades when the auth user is deleted.
