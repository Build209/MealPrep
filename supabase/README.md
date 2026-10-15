# supabase/

The live Supabase edge functions and their checks. Moved here from `mobile/supabase/functions` so they survive the switch-over (when `mobile/` is deleted).

- `functions/` - the source of every live edge function: ask-forky, creator-videos, delete-user-account, kroger-deals, library-generate, pantry-vision, recipe-import, recipeapi-proxy, scan-photo-retention, stripe-checkout, stripe-portal, stripe-webhook, usda-proxy, viral-recipes, plus `_shared/`.
- `scripts/` - Node checks for those functions (run with tsx). `scripts/fixtures/` holds their test data.
- `package.json` - one dev dependency (tsx, pinned) and the `test` scripts.

- `history/` - the old app's migrations, loose setup SQL, seed data and the stores ingest tool, moved from `mobile/` at the switch-over. History only; see `history/README.md`.

Not here: the database. `db/supabase/` is the local test database built from the live schema baseline; it is the source of truth for migrations.

## Deploy

Manual only, one function at a time, from `main`: Actions > "Deploy Supabase function" > Run workflow (`.github/workflows/deploy-function.yml`). It runs `supabase functions deploy <name>` from the repo root, so it reads `supabase/functions/<name>/`. The owner runs it; nothing deploys on push or merge.

Until the switch-over release reaches `main`, `main` still has the functions in `mobile/supabase/functions` and deploys from there. A function change made on `main` before then must be ported to `supabase/functions/` here.

A new function needs a folder here and a choice in the workflow; `scripts/deploy-workflow-check.ts` fails if they drift apart.

## Checks

```
cd supabase
npm install
npm test
```

CI: `.github/workflows/functions-ci.yml` runs `npm test` on pull requests that touch `supabase/**`, the terms and privacy pages, the live baseline in `db/` (or the two workflows) and on pushes to `rebuild/v1` and `main`.

The checks read this folder, the deploy workflow, `app/public/terms.html` and `privacy.html` (`legal-pages-check.ts`: the pages state the limits, prices, terms date, photo window and AI provider the functions use) and the live baseline in `db/` (`stripe-webhook-check.ts`). The old app's `mobile/scripts/*-mobile-check.ts` halves went with `mobile/` at the switch-over: their page parts are in `legal-pages-check.ts`; their old-app code and old-migration parts are retired.

`npm run test:viral-recipes-live` calls YouTube for real (needs `YOUTUBE_API_KEY`, skips without it) and is not part of `npm test`.
