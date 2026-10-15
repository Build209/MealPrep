# Old app docs (history)

Moved from `mobile/docs/` when `mobile/` was deleted at the switch-over. **Not re-checked; treat as history.**

- `CREATORS.md`, `LIBRARY_RECIPES.md`, `RECIPE_DISCOVERY.md`, `SMART_SHOP.md`: setup notes from the old app.
  The parts about edge functions and their secrets still describe live functions (now in `supabase/functions/`).
  Anything about screens, `mobile/config`, `mobile/lib` or `cd mobile` is stale.
- Old paths: `mobile/supabase/migrations/` and the loose `mobile/supabase/*.sql` and `seed-data/` are now in
  `supabase/history/`; `mobile/scripts/stores-ingest/` is `supabase/history/stores-ingest/`.
  Everything else from `mobile/` is in git history only (last on `main` before the switch-over merge).

Still-current go-live list: `docs/GO_LIVE.md` (with its own stale notes).
