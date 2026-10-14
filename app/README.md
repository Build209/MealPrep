# app: the rebuilt MealPlanatic

Rebuild spec v1, phase 0. This folder is the new app; the old one in `mobile/` stays live and
untouched until switch-over, when `mobile/` is deleted in the same release.

- Expo 57, React Native, Expo Router (routes in `src/app/`), supabase-js, TanStack Query.
- `src/theme/tokens.ts`: colours (from the live theme), the six type sizes, corners, spacing.
  `tests/tokens.test.ts` checks contrast and keeps the colours equal to `mobile/config/theme.colors.json`.
- `src/ui/`: small shared pieces (text, button, card, screen, top bar).
- `src/lib/`: the Supabase client and the query client. The server is the only source of truth:
  screens read through queries and never keep their own copy of server data. The sign-in session
  is kept on the device (localStorage on the web, AsyncStorage on phones: `authStorage.native.ts`).
- `/reset-password` (`src/auth/ResetPasswordScreen.tsx`): where reset emails land on the web;
  choose a new password, then Home.
- `src/data/`: the data layer (query keys, row models, optimistic mutations, `useIsOnline`).
  Rules in `src/data/README.md`.
- `src/auth/`: sign-in, create account (18+ box), forgot password, sign out, and `AuthProvider`
  (session from `onAuthStateChange`). The tabs need a session; signed out goes to `/sign-in`.
  Rules and wording are in `logic.ts` and `copy.ts`, tested in `tests/auth-*.test.ts`.
- `src/grocery/`: the Grocery tab (phase 2). The list by aisle, add, tick into the pantry with Undo,
  Clear ticked. Ticking is one server call (`tick_grocery_item`, a new migration in `db/` that is not
  on the live database until the owner approves it). Data hooks: `src/data/grocery.ts`, `groceryMutations.ts`.
- `src/scan/`: shelf, fridge, spice rack and receipt photo scans through the live `pantry-vision` function
  (unchanged; same request as the old app), a review list before saving, and `ScanButton` with this month's
  allowance (`planTiers.ts` is a verbatim copy of the function's table, kept equal by a test). Route: `/scan`.
  The Scan button sits on the Pantry tab. Scans are matched against the pantry with the old app's
  rules (`src/kitchen/pantryMatch.ts`): shelf items already there are shown as "Already in your pantry"
  and left unticked; receipt lines add to a matching row with the same unit. With no scans left the
  button says so and opens a sheet about the monthly allowance, with "See plans" (opens `/plans`).
- `src/plans/`: `/plans` and `/usage` (phase 4), linked from Home ("Plans & usage"). Plans: the current
  plan (`profiles.plan`/`plan_tier`, `billing_subscriptions`), and for a free account on the web the
  monthly/yearly switch, Plus, Pro and Family with price and monthly limits, the renewal terms directly
  above the one tomato buy button. Buy and "Manage subscription" call the live `stripe-checkout` and
  `stripe-portal` functions exactly as the old app does and go to Stripe's page; the app never sees card
  details. Money wording is copied word for word from the live app (`src/plans/copy.ts`, checked by
  `tests/plans-pricing.test.ts`); change it there with compliance first. Usage: this month's scans,
  imports and Ask Forky questions against the plan's monthly limits (no daily numbers yet). The e2e
  tests stub both Stripe functions and Stripe's pages.
  button says so and opens a sheet about the monthly allowance, with "See plans" (the live app for now).
- `src/forky/`: Ask Forky (`/forky`), the AI chat through the live `ask-forky` function (unchanged; same
  request as the old app), with "N messages left this month" from `forky_chat_usage` and the plan limits,
  recipe buttons to `/recipe/<id>`, and the AI notice always on screen. The chat is kept in memory for the
  session only. Forky stands in the top bar (opens the chat) and shows short tips with the old app's
  backoff rules (`tipBackoff.ts`). Tips that open by themselves are off under browser automation.
- `src/recipes/`: Home "Cook from your pantry" (phase 3) and the recipe detail (`/recipe/[id]`). Recipes come
  from `recipes` (master + the person's own) and published `library_recipes` (`src/data/recipes.ts`), ranked
  against the pantry with the old app's rules (`src/kitchen/recipeMatch.ts`, `recipeFeed.ts`, tested in
  `tests/kitchen-recipe-*.test.ts`). Each card has a status sticker: leaf "Ready to cook" or banana "N missing".
  Recipe ids: `r_<uuid>` (recipes) and `l_<uuid>` (library); build links with `recipeHref()`.
  "Add N missing to grocery list" is one server call (`add_missing_to_grocery`, a new migration in `db/`, not on
  the live database until the owner approves it) that merges into open grocery rows once per recipe.
- Recipes, phase 3 (search, saved, creator videos):
  - `/recipes/search` (`src/recipes/search/`): master and own recipes and published library recipes by
    title or ingredient, plus creator videos from `search_creator_videos`. The recipe list is read once
    and searched on the device (ingredients are jsonb, which PostgREST can't ilike). Merge order ported
    from the old app: own recipes first, then recipes and videos taking turns, repeats dropped.
    Recipes link to `/recipe/r_<uuid>` (recipes) or `/recipe/l_<uuid>` (library_recipes).
  - `/recipes/saved` and `SaveButton` (`src/recipes/saved/`): the heart saves to `user_saved_recipes`
    with the old app's keys (`kitchen:<slug or uuid>`, `kitchen:library-<slug>`, `creator:<video id>`),
    so both apps read each other's saves until switch-over. For the recipe page:
    `<SaveButton target={saveTargetForRecipe(...)} />`.
  - `/creators` and `CreatorVideosRow` (`src/creators/`): recent videos from enabled creators, read
    straight from `creator_videos`, with the old function's recipe-video rule (`videoFilter.ts`) and text
    cleaning (`videoText.ts`). Videos open outside the app, labelled "Watch on YouTube" in plain text.
- Recipes wired together (phase 3): Home (`src/app/(tabs)/index.tsx`) starts with links to Search and
  Saved and a secondary "Import a recipe" button (`src/recipes/HomeActions.tsx`), then the pantry feed,
  then `CreatorVideosRow` with "See all creator videos" (`/creators`). The recipe page has the heart
  (`SaveButton`) for recipes and library rows: `saveableFromAppRecipe()` (`src/data/savedRecipeRows.ts`)
  turns the page's `AppRecipe` into the same save target search builds, so both hearts write and find
  one `user_saved_recipes` row (checked in `tests/recipe-save-bridge.test.ts`). Saving an import opens
  `/recipe/r_<id>`. End to end: `e2e/recipes-wiring.spec.ts` (import, page, save, Saved, search).
- `src/recipes/import/`: import a recipe (phase 3) at `/recipes/import`. Paste a link or recipe text, or use a
  recipe photo or a saved video; the live `recipe-import` function reads it (unchanged; same request as the old app),
  then a review form, then Save writes the person's own `recipes` row (is_master false, creator credit in source_*)
  and opens `/recipe/r_<id>`. The Import button shows this month's imports left (limits from `src/scan/planTiers.ts`).
- One folder per feature as features arrive (`pantry/`, `grocery/`, `recipes/`, ...), no file over about 400 lines.

```bash
cd app
npm install
npm run typecheck && npm test
npm run web          # local preview in a browser
```

CI: `.github/workflows/app-ci.yml` (typecheck, tests, web build) on pull requests that touch `app/`.

Phone preview: `.github/workflows/app-preview.yml` builds the web app against the live database on
every push to `rebuild/v1` and stores it on the `app-preview` branch, with a small "Preview build"
label (`EXPO_PUBLIC_APP_CHANNEL=preview`, logic in `src/lib/channel.ts`). How to open it on a phone:
`PREVIEW.md`.

End-to-end: `.github/workflows/app-e2e.yml` starts a local Supabase stack from `db/` (database, auth,
REST; email confirmation off, local only), builds the web export against it, and runs the Playwright
tests in `e2e/` in Chromium: signed-out goes to sign-in, create account with the 18+ box, sign out and
back in, and row level security on the user's own profile and pantry rows. Every new feature adds a
test there. Locally, with Docker and the Supabase CLI:

```bash
supabase start --workdir ../db
supabase status -o env --workdir ../db   # API_URL, ANON_KEY, SERVICE_ROLE_KEY of the LOCAL stack
export E2E_SUPABASE_URL=... E2E_SUPABASE_ANON_KEY=... E2E_SUPABASE_SERVICE_ROLE_KEY=...
EXPO_PUBLIC_SUPABASE_URL=$E2E_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY=$E2E_SUPABASE_ANON_KEY npm run export:web
npx playwright install chromium && npm run e2e
```

The tests refuse any Supabase address that is not on this machine.
