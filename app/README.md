# app: the rebuilt MealPlanatic

Rebuild spec v1. This folder is MealPlanatic, served at https://mealplanatic.app from `main` by
`.github/workflows/pages.yml`. The old app in `mobile/` was deleted at the switch-over (`SWITCHOVER.md`);
it is in git history only. Edge functions are in `../supabase/functions`, the database in `../db`.

- Expo 57, React Native, Expo Router (routes in `src/app/`), supabase-js, TanStack Query.
- `src/theme/tokens.ts`: colours (from the live theme), the six type sizes, corners, spacing.
  `tests/tokens.test.ts` checks contrast and keeps the colours equal to `src/theme/theme.colors.json`
  (copied byte for byte from the old app's `mobile/config/theme.colors.json` at the switch-over).
- `tests/fixtures/old-app/`: a snapshot of the old app's money, account-deletion and Ask Forky wording
  (compliance-approved). `plans-pricing`, `account-copy` and `forky-request` tests check the LIVE lines against it.
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
  Clear ticked. The list starts with a row of 3 store circles (`src/stores/StoresRow.tsx`, rules in `storeRow.ts`):
  the 3 newest favourite stores, then the closest stores when a location is already saved, else "Find stores";
  a circle opens Stores at that store (`/grocery?view=stores&store=<key>`), where a star adds or removes a favourite.
  Circles show the chain's initials (`StoreBadge`); real logos go only in `src/stores/storeLogos.ts`, empty until
  the owner and compliance clear them. Ticking is one server call (`tick_grocery_item`, a new migration in `db/` that is not
  on the live database until the owner approves it). Data hooks: `src/data/grocery.ts`, `groceryMutations.ts`.
- `src/scan/`: shelf, fridge, spice rack and receipt photo scans through the live `pantry-vision` function
  (unchanged; same request as the old app), a review list before saving, and `ScanButton` with this month's
  allowance (`planTiers.ts` is a verbatim copy of `supabase/functions/_shared/planTiers.ts`, kept equal by
  `tests/scan-planTiers.test.ts`). Route: `/scan`.
  The Scan button sits on the Pantry tab. Scans are matched against the pantry with the old app's
  rules (`src/kitchen/pantryMatch.ts`): shelf items already there are shown as "Already in your pantry"
  and left unticked; receipt lines add to a matching row with the same unit. With no scans left the
  button says so and opens a sheet about the monthly allowance, with "See plans" (opens `/plans`).
- `src/plans/`: `/plans` and `/usage` (phase 4), linked from Account ("Plans & usage"). Plans: the current
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
  session only. On a short screen (under 480px tall: a flip phone's cover screen, a phone on its side) the question
  box scrolls with the chat instead of being pinned, so Send is never covered. Forky stands in the top bar (opens the chat) and shows short tips with the old app's
  backoff rules (`tipBackoff.ts`). Tips that open by themselves are off under browser automation.
- Tabs (owner, 2026-10-15): Home, Pantry, Recipes, Grocery. `src/home/`: Home is an Ask Forky box at the top
  (`HomeForkyBox`: Send opens `/forky?q=...`, and the chat sends it with its own Send, so there is one place that
  calls ask-forky; the allowance line comes from the shared `useForkyAllowance`, and the AI notice is shown word for
  word), then three counters that open their tabs (`HomeCounters`: "Ready to cook" from the feed's own scoring,
  `readyToCookCount` in `src/kitchen/recipeFeed.ts`; pantry items; grocery items not ticked; the recipes counter's
  name is one line in `src/home/copy.ts`), then `HomePromoSlot`, a slot kept for ads or a small store: today it
  loads nothing from outside and shows no ads (ads need privacy-page, consent and compliance changes first), only a
  card linking to `/plans` in approved wording, on the web, for free accounts. Grocery has a "List" | "Stores"
  switch (`/grocery?view=stores`); `/stores` redirects there (`src/app/stores.tsx`). Stripe's return markers are
  still handled for every screen by `CheckoutReturnNotice`. End to end: `e2e/home.spec.ts`.
- `src/recipes/`: the Recipes tab (`/recipes`, `RecipesScreen`; Home until 2026-10-15) "Cook from your pantry" (phase 3) and the recipe detail (`/recipe/[id]`). Recipes come
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
- Recipes wired together (phase 3): the Recipes tab (`src/recipes/RecipesScreen.tsx`) starts with links to Search and
  Saved and a secondary "Import a recipe" button (`src/recipes/RecipesActions.tsx`), then the pantry feed,
  then `CreatorVideosRow` with "See all creator videos" (`/creators`). The recipe page has the heart
  (`SaveButton`) for recipes and library rows: `saveableFromAppRecipe()` (`src/data/savedRecipeRows.ts`)
  turns the page's `AppRecipe` into the same save target search builds, so both hearts write and find
  one `user_saved_recipes` row (checked in `tests/recipe-save-bridge.test.ts`). Saving an import opens
  `/recipe/r_<id>`. End to end: `e2e/recipes-wiring.spec.ts` (import, page, save, Saved, search).
- `src/recipes/import/`: import a recipe (phase 3) at `/recipes/import`. Paste a link or recipe text, or use a
  recipe photo or a saved video; the live `recipe-import` function reads it (unchanged; same request as the old app),
  then a review form, then Save writes the person's own `recipes` row (is_master false, creator credit in source_*)
  and opens `/recipe/r_<id>`. The Import button shows this month's imports left (limits from `src/scan/planTiers.ts`).
- `src/account/`: delete account (phase 4) at `/delete-account`, the same address as the live page that the
  privacy policy and terms link to; Account links to it. It says what is deleted (and that
  MealPlanatic Plus is cancelled), then Delete account, a confirm step, and the live `delete-user-account`
  function (unchanged; same request as the old app, built in `deleteRequest.ts`). Afterwards the session is
  removed from the device and sign-in says the account was deleted. Wording is the live app's word for word
  (`copy.ts`, checked by `tests/account-copy.test.ts`). No tomato: the delete button is ink. End to end:
  `e2e/account-delete.spec.ts` (the function is stubbed; nothing is deleted).
- Account (`/account`, `src/account/AccountScreen.tsx`), Home's one "Account" link (and the person icon in the top bar): the signed-in email, the
  current plan with "Manage subscription" (the same card, plan read and rules as `/plans`, shared in
  `src/plans/CurrentPlan.tsx`; shown only for a live subscription), then "Plans & usage", "Delete account" and the
  sign-out card. It is the "Account, Manage subscription" the approved renewal terms name
  (`tests/account-screen-copy.test.ts` keeps the two in step). End to end: `e2e/account.spec.ts` (stripe-portal stubbed).
- Tabs and screen-to-screen feel (`src/app/(tabs)/_layout.tsx`, `src/app/_layout.tsx`): a Feather line icon
  (`@expo/vector-icons` 15.1.1, the version `mobile/` uses) over each tab label, ink when active and muted
  otherwise, hidden from screen readers. The bar is its base height plus the bottom safe-area inset; on the web,
  `src/lib/viewport.ts` adds `viewport-fit=cover` so iPhone Safari reports the home-indicator inset. Screens
  above the tabs get the top and bottom insets from the stack. Tabs load on first open (not preloaded: on the
  web, tabs you are not on stay in the page, so preloading duplicated their content). Tabs cross-fade (150 ms),
  phone stack screens fade, web screens fade in once on open (160 ms, `src/ui/Screen.tsx`); all off with
  reduced motion. Phone tour test "tab bar: icons over labels, on screen, above the safe area".
- One folder per feature as features arrive (`pantry/`, `grocery/`, `recipes/`, ...), no file over about 400 lines.

```bash
cd app
npm install
npm run typecheck && npm test
npm run web          # local preview in a browser
```

CI: `.github/workflows/app-ci.yml` (typecheck, tests, web build) on pull requests that touch `app/` and on
pushes to `rebuild/v1` and `main`. `site-build.yml` builds the whole Pages site (`scripts/build-site.sh`) on
pull requests; `pages.yml` builds and deploys it on pushes to `main`.

Phone preview: `.github/workflows/app-preview.yml` builds the web app against the live database on
every push to `rebuild/v1` and stores it on the `app-preview` branch, with a small "Preview build"
label (`EXPO_PUBLIC_APP_CHANNEL=preview`, logic in `src/lib/channel.ts`). How to open it on a phone:
`PREVIEW.md`.

Android (Google Play): `eas.json` (profiles `preview` = .apk, `production` = .aab) and the hand-started
workflow `.github/workflows/android-release.yml` (needs the `EXPO_TOKEN` secret). Owner steps:
`../docs/GOOGLE_PLAY.md`.

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

Phone pass: `.github/workflows/app-phone.yml` runs every spec in `e2e/` on two phone profiles
(`playwright.phone.config.ts`: `iphone` = iPhone 15 in WebKit when CI can install it, else Chromium
with the iPhone's size, user agent and touch; `android` = Pixel 7 in Chromium), plus the screen tour
`e2e/phone-tour.spec.ts` (phone config only). The tour seeds a local account, stubs the edge functions,
visits every screen of SWITCHOVER.md section 2 that a browser can reach and, per screen, saves
`phone-screens/<project>/<NN>-<screen>.png` (plus `-bottom.png` when the screen scrolls) and runs the
checks in `e2e/phone-checks.ts`: no sideways scroll, tap targets at least 44x44 px (allowed: links inside
a sentence, and controls inside a bigger tappable one), no clipped text (ellipsis on purpose is only
reported), and tomato only in a camera or money context (the "Plan" in the wordmark is reported as
brand, never a failure). `e2e/phone-report.mjs` writes `phone-screens/phone-report.json` and `.md`.
Results: artifact `phone-screens` on every run; branch `phone-screens` after each push to `rebuild/v1`
or a manual run; branch `phone-screens-pr-<number>` for pull requests from this repository
(`git fetch origin phone-screens && git checkout FETCH_HEAD -- .` in an empty folder). Locally, after
the export: `npx playwright install chromium webkit && npx playwright test -c playwright.phone.config.ts
&& node e2e/phone-report.mjs`.

Site tests: `e2e-site/` checks the whole GitHub Pages site (`scripts/build-site.sh` output in `site/`)
served the way Pages serves it (`e2e-site/serve-pages.mjs`: unknown addresses get `404.html` with
status 404, folders get a trailing slash). Covered: `/` opens the app; deep links (`/pantry`,
`/recipes/search`, `/delete-account`, ...) open the app on that route; the legal pages at
`/terms.html`, `/privacy.html`, `/terms/`, `/privacy/`; the redirect stubs; `/209/`; and the
service-worker clean-up (a stand-in of the old worker, `e2e-site/fixtures/old-sw.js`, is installed at
`/sw.js` and then replaced by the site's `sw.js`). Chromium only. Built with dummy Supabase settings;
every request off the machine is blocked. CI: job `site-e2e` in `.github/workflows/site-build.yml`.

```bash
EXPO_PUBLIC_SUPABASE_URL=https://e2e-site-dummy.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy \
  bash scripts/build-site.sh
npx playwright install chromium && npx playwright test -c e2e-site
```
