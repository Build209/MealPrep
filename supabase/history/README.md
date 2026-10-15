# supabase/history: old database files (history only)

Moved with `git mv` from `mobile/supabase/` at the switch-over, so `git log --follow` still shows their past.

- `migrations/`: the old app's migrations. They drifted from the live database and are **not** the source of truth.
  The live schema baseline and every new migration are in `db/supabase/migrations/` (see `db/README.md`).
- `setup.sql`, `meal_plan_items_setup.sql`, `owner_recipes_setup.sql`, `recipes_import.sql`: old paste-in setup scripts.
- `seed-data/youtube_cooking_creators.json`: the source list behind the creator seed migration.
- `stores-ingest/`: the Python tool that loaded `public.stores` from Overture Places (one-off, run by hand; not in CI).

Do not run any of this against the live database.
