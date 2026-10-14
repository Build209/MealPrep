# Switch-over checklist (rebuild spec v1, phase 6)

Moving mealplanatic.app from the old app (`mobile/`, on `main`) to the new app (`app/`, on `rebuild/v1`).

**Nothing in this list is done yet.** Written 2026-10-14 from the repo, read-only.

Who does what:

- **Owner:** every yes, every live setting, the test card, the merge, Stripe, secrets.
- **Manager (Claude session):** opens the PRs, reads the database read-only after each test step, watches the deploy.
- **Helper:** code moves in the switch-over PR only.

Same live database before and after. Accounts keep their data. Nothing to migrate.

Marked **(not verified)** = read in code or docs but not tried.

---

## 1. Before the merge

### 1a. Bring `rebuild/v1` up to date with `main`

- [ ] `main` has 2 commits that `rebuild/v1` lacks: PR #260 (scan-photo deletion).
  - `mobile/supabase/functions/scan-photo-retention/`
  - `mobile/supabase/functions/_shared/scanRetention.ts`
  - `mobile/scripts/scan-photo-retention-check.ts`
  - `mobile/supabase/migrations/20261013030000_scan_photo_retention.sql`
  - the `scan-photo-retention` option in `deploy-function.yml`
- [ ] Merge `main` into `rebuild/v1` (a PR, owner merges) before the switch-over PR, so none of it is lost.
- [ ] Check `main` again right before the release. Any later old-app fix must come along too.

### 1b. Code moves (one switch-over PR into `rebuild/v1`)

`mobile/` is deleted in the release. These must move first.

**Live edge function sources: move, do not delete.**

- [ ] `git mv mobile/supabase/functions supabase/functions` (new root `supabase/` folder).
  - All 14 functions: ask-forky, creator-videos, delete-user-account, kroger-deals, library-generate,
    pantry-vision, recipe-import, recipeapi-proxy, stripe-checkout, stripe-portal, stripe-webhook,
    usda-proxy, viral-recipes, scan-photo-retention (after 1a).
  - Plus `_shared/` and `creator-videos/fixtures/`.
- [ ] `.github/workflows/deploy-function.yml`: change `working-directory: mobile` to the repo root
      (it runs `test -f supabase/functions/$FUNCTION_NAME/index.ts`, then `supabase functions deploy`).
- [ ] After the release, deploy ONE harmless function from `main` with the workflow to prove the new path works (owner, Actions tab). (not verified)
- [ ] `mobile/supabase/functions-bundled/` (pasteable bundles, made by `mobile/scripts/bundle-edge-function.mjs`): keep the script with the functions or drop both. Owner's call.

**Old migrations and SQL: history only.**

- [ ] Move `mobile/supabase/migrations/` (51 files after 1a) and the loose `mobile/supabase/*.sql` + `seed-data/` to `supabase/history/` (or rely on git history; owner's call).
- [ ] Add `20261013030000_scan_photo_retention.sql` to `db/supabase/migrations/` (renamed after the baseline date) once it is on live, and mark it in `db/README.md`.

**Function checks that live in `mobile/scripts/` and run in old CI (`ci.yml`, job `mobile`).**
These test the live functions. Deleting `mobile/` drops them silently.

- [ ] Move the function checks next to the functions and give them a CI job:
  `ask-forky-allowance-check`, `ask-forky-check`, `creator-list-visibility-check`, `creator-recipes-check`,
  `creator-video-filter-check`, `creator-video-sanitizer-check`, `creator-videos-edge-check`,
  `delete-account-billing-check`, `pantry-vision-gemini-budget-check`, `pantry-vision-gemini-inline-check`,
  `pantry-vision-handler-check`, `pantry-vision-merge-inline-check`, `plan-tiers-check`,
  `recipe-import-check`, `stripe-checkout-check`, `stripe-webhook-check`, `scan-photo-retention-check`.
  - `plus-upgrade-ui-check` and the `viral-recipes-*` scripts also read function files; check each.
  - Note: `scripts/plan-tiers-check.ts` is at `mobile/scripts/`, not at the root.

**`app/` tests that read files in `mobile/`.** Each one SKIPS quietly when `mobile/` is gone, so CI stays green while the guard is lost.

| Test | Reads | Fix |
|---|---|---|
| `app/tests/scan-planTiers.test.ts` | `mobile/supabase/functions/_shared/planTiers.ts` | point at `supabase/functions/_shared/planTiers.ts` |
| `app/tests/recipe-import-allowance.test.ts` | same file | same |
| `app/tests/forky-request.test.ts` | `.../ask-forky/index.ts`, `_shared/askForkyText.ts`, `mobile/config/askForky.ts` | point the first two at `supabase/functions/`; the AI-notice check against `mobile/config` can retire |
| `app/tests/plans-pricing.test.ts` | `_shared/billingText.ts`, `mobile/config/pricing.ts` and 3 more old-app files | point the renewal-wording check at `supabase/functions/_shared/billingText.ts`; the old-app wording check can retire |
| `app/tests/creators-video-filter.test.ts` | `.../creator-videos/fixtures/manual-hide-videos.json` | point at the moved fixture |
| `app/tests/tokens.test.ts` | `mobile/config/theme.colors.json` | retire, or copy the file into `app/` |

- [ ] Fix each test above in the switch-over PR.
- [ ] Then make a missing file a FAILURE, not a skip, for the function-contract tests (`planTiers`, `billingText`, `ask-forky`). Otherwise a wrong path hides a real price or wording drift.
- [ ] `grep -rn "mobile" app/ .github/ db/` comes back with comments only.
- [ ] No code in `app/src` imports from `mobile/` (checked 2026-10-14: comments only).

**Static legal pages: same URLs after the switch.** Prepared on branch `rebuild/site-build` (PR into `rebuild/v1`).

- [x] Copy `mobile/public/privacy.html` and `mobile/public/terms.html` to `app/public/` unchanged (byte for byte; `site-build.yml` checks it with `cmp`).
  - The new app links to `https://mealplanatic.app/terms.html` and `/privacy.html` (`app/src/auth/copy.ts`).
  - `stripe-checkout` sends `<APP_WEB_URL>terms.html` to Stripe (`_shared/billingText.ts`).
  - Today `pages.yml` also copies them to `/privacy/` and `/terms/`. Both forms kept (`build-site.sh`).
  - Their relative links (`terms.html` inside `/privacy/`) now redirect to `/terms.html` / `/privacy.html` instead of the app's 404.
- [ ] `/delete-account` must exist. The privacy page links to `https://mealplanatic.app/delete-account`.
      `app/src/app/delete-account.tsx` is now on `rebuild/v1`; it opens through the `404.html` fallback. Confirm on the preview (test 8). (not verified)
- [x] `app/public/zcta-centroids.json` is already there (same bytes as `mobile/public`).
- [x] Service worker clean-up: the old app installed `sw.js` (scope `/`) on every browser that opened it. The new app has none.
  - `app/public/sw.js`: deletes the `meal-prep-shell-*` caches, unregisters itself, reloads open tabs once. No fetch handler.
  - `app/public/pwa-register.js`: no-op for cached old pages; removes any worker left.
  - Copies at `/app/sw.js` too (precaution, in case a browser registered it under `/app/`).
  - (not verified on a real browser with the old SW installed) Check in section 5.
- Not carried over: `mobile/public/fonts/` (the new app bundles its own fonts), the old `manifest.webmanifest` and `icons/` (generated by the old export; the new app has no web manifest). A phone that "added to home screen" still opens `/`. (not verified)

**Pages workflow (`pages.yml`) rewritten for `app/`.** Prepared: `docs/pages.switchover.yml` (proposed `pages.yml`; GitHub does not run it there) + `app/scripts/build-site.sh` (assembles the site) + `.github/workflows/site-build.yml` (builds and checks it on PRs, never deploys).

- [x] Build from `app/` (Node 22, `npm ci` once `app/package-lock.json` is committed, `npm run export:web`), env:
  - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public values, as today)
  - `EXPO_PUBLIC_GIT_SHA: ${{ github.sha }}`
  - **no** `EXPO_PUBLIC_APP_CHANNEL` (unset = no "Preview build" label; `app/src/lib/channel.ts`)
- [x] `cp index.html 404.html` (deep links like `/pantry` need it; `output: "single"` in `app/app.json`).
- [x] Keep `/209/` (copy of `New/`) and its old-root redirects.
- [x] Keep the `/app/*` redirect stubs (same list as today, plus `stores`, `profile`, `pantry-staples`).
- [x] Old app routes that no longer exist: redirect pages (`/x.html` and `/x/index.html`, same JS redirect as today plus a meta-refresh and canonical link):
  - `/recipes` and `/discover-recipes` to `/recipes/search`
  - `/smart-shop` to `/stores`
  - `/pantry-staples` to `/pantry`
  - `/profile` to `/account`
  - `/admin` to `/` (no admin screen in the new app, see risks)
  - `/preview/video-recipe-detail` to `/`
  - `/pantry`, `/grocery`, `/stores`, `/delete-account` exist in the new app.
  - `/discover-recipes/<id>` (old recipe-detail links): open the new app's "not found" screen. The old ids are not new recipe ids.
- [x] The build fails without `404.html` (`build-site.sh` self-check, and again in `site-build.yml`).
- [x] Domain: `build-site.sh` writes `CNAME` (`mealplanatic.app`). GitHub ignores it for Actions deploys; the domain is the Pages setting (not verified). Nothing to change if that is right.
- [ ] Switch-over PR: `cp docs/pages.switchover.yml .github/workflows/pages.yml`, delete the doc copy.
- Note: unknown routes now return the app with HTTP status 404 (GitHub Pages serves `404.html` with 404). The page works; search engines will not index deep links. Today the old app had real files per route.

**CI and preview workflows.**

- [ ] `ci.yml`: drop the `mobile` job; keep `static-site`; add the function-check job from above.
- [ ] `app-ci.yml`, `app-e2e.yml`, `db-baseline.yml`, `app-preview.yml`: add `main` to their `push` branches (today only `rebuild/v1`).
- [ ] `preview-build.yml` (builds `mobile/` for `redesign/**`): delete.
- [ ] `app-preview.yml`: delete, or keep for future preview work. If deleted, delete the `app-preview` branch and disconnect the Cloudflare Pages project (owner).
- [ ] `app/README.md`: remove "old one in `mobile/` stays live"; update the `planTiers` and tokens notes.
- [ ] Root `README.md`, `PRODUCT.md`, `DESIGN.md`: fix any `mobile/` paths.
- [ ] `mobile/docs/GO_LIVE.md` and other old docs: move what is still true to `docs/`, or rely on git history.

### 1c. Database (owner's yes for each)

- [x] `add_missing_to_grocery` (`db/supabase/migrations/20261014030000_add_missing_to_grocery.sql`) is on live (applied 2026-10-14 with the owner's yes).
      The new recipe page's "Add N missing to grocery list" calls it. Apply before the release, or that button fails for everyone.
- [ ] Already on live 2026-10-14: `tick_grocery_item` / `untick_grocery_item`, `recipes_read` (master + own).
- [ ] Daily caps (spec phase 4): migration file only, not built. Decide: block the release or ship after.

### 1d. Settings (owner)

- [ ] Supabase > Authentication > URL Configuration:
  - Site URL stays `https://mealplanatic.app`.
  - Redirect URLs: `https://mealplanatic.app/**` must be on the list so `/reset-password` works (not verified whether it is there today).
  - After the switch, remove `https://mealplanatic-preview.pages.dev/**` if the preview is retired.
- [ ] Edge function secret `APP_WEB_URL` stays `https://mealplanatic.app/`. Stripe returns to `/?checkout=success`, `/?checkout=cancel`, `/?billing=return`. The new Home route takes these. No change.
- [ ] Stripe webhook URL: unchanged (the function URL does not move).
- [ ] Frozen PRs into `main`: #237 (cook mode) and #249 (weekly recap) touch `mobile/` only. They become dead. Owner decides whether to close them.

---

## 2. Test list on the owner's phone

On the **new app's preview** (mealplanatic-preview.pages.dev, or wherever `app-preview` is hosted), live database, Stripe **TEST** mode.

- Tests 1 to 8: a free, non-admin test account (owner makes it; no passwords in chat).
- The owner types the test card. The manager reads the database (read-only) after each step.
- Done box: tick when the expected result is seen.

### 2a. The 10 go-live tests (from "Do list"), new app screens

| # | What to do | Expected | DB check (manager) | Done |
|---|---|---|---|---|
| 1 | Home > "Plans & usage" (`/plans`). Switch Pay monthly / Pay yearly. | Plus $4.99 a month / $53.88 a year; Pro $8.99 / $93.84; Family $20 / $192. Each row shows scans, imports and Ask Forky questions. The renewal lines sit directly above the one tomato "Subscribe for ..." button. | none | [ ] |
| 2 | Choose Pro, Pay monthly, "Subscribe for $8.99 a month". Pay with the test card on Stripe's page. | Stripe returns to `/?checkout=success`. Plans shows Pro without a manual reload. (The return itself is a page load; if the webhook is slower, the screen may still say Free for a moment: note it.) | `profiles.plan_tier = 'pro'`; one consent row with the price, terms version `2026-10-11`, disclosure version `2026-10-11.1` | [ ] |
| 3 | On a fresh free account: press Subscribe twice fast; then open `/plans` in two tabs and press in both. | One Stripe checkout page only (T-5). | one checkout session / no second subscription | [ ] |
| 4 | Pro account: `/plans` > "Manage subscription" > Stripe portal > cancel. Back in the app. | "Your plan ends on <date>. You will not be charged again." Plan stays Pro until then. | `billing_subscriptions.cancel_at_period_end = true`, `plan_tier` still `pro` | [ ] |
| 5 | Second free account: buy with declined card 4000 0000 0000 0002. | Stripe refuses. App stays Free. | `plan_tier = 'free'`, no active subscription row | [ ] |
| 6 | Fresh free account: 4 scans (Pantry > Scan), 3 imports (Home > Import a recipe), 6 Ask Forky questions. Also one receipt scan. | 4th scan, 3rd import, 6th question each refused with the plan offer ("See plans" opens `/plans`). The receipt scan works and uses the same pool of 3. | usage counters stop at 3 / 2 / 5 | [ ] |
| 7 | Sign out > create account. Open Terms from the sign-up screen. | The 18+ box must be ticked to create an account; it says 18 or over. Terms page says 18 or over. | new profile row is free, not admin | [ ] |
| 8 | **Owner's yes first.** Subscribed throwaway account: delete the account (new delete screen, `/delete-account`). | Account gone; signed out. Stripe subscription cancelled. Later webhook events for it answer 200 (T-4). | profile and kitchen rows gone; billing row kept, unlinked; webhook log 200 | [ ] |
| 9 | Owner's own account: one shelf scan, one receipt scan, one video recipe import. | Each works. | manager reads the cost of each in the `pantry-vision` and `recipe-import` logs (video import cost never measured) | [ ] |
| 10 | Buy Family once and Plus once (or the owner accepts test 2 as covering the shared path). | Same as test 2 with `family` / `plus`. | `plan_tier` matches | [ ] |

### 2b. Every feature of the new app

| # | Feature | What to do | Expected | DB check | Done |
|---|---|---|---|---|---|
| F1 | Sign in | Sign out, sign in. | Lands on Home. Signed out, any tab goes to `/sign-in`. | none | [ ] |
| F2 | Forgot password | "Forgot password", enter the address, open the email link. | Opens "Choose a new password" (`/reset-password`); new password works; then Home. | none | [ ] |
| F3 | Pantry add | Pantry > Add item: "eggs, 12". | Shows on the list in the right place. | `pantry_items` row | [ ] |
| F4 | Pantry shelf view | Switch list / shelf view. | Items appear on shelves; switch stays. | none | [ ] |
| F5 | Shelf scan | Pantry > Scan > shelf photo > review > save. | Review list; items already in the pantry show "Already in your pantry", unticked; saved items appear. Scan count drops by 1 on the button. | new `pantry_items`, scan usage +1 | [ ] |
| F6 | Receipt scan | Scan > Receipt > photo. | Screen says "The photo is read, then not kept." Lines with a matching item and unit add to that row. | quantities added, not duplicated | [ ] |
| F7 | Scan limit | (Covered in test 6.) | Sheet about the monthly allowance with "See plans". | | [ ] |
| F8 | Grocery add | Grocery > add "milk". | Shows under its aisle. | `grocery_list_items` row | [ ] |
| F9 | Grocery tick + Undo | Tick "milk", then Undo. | Tick moves it into the pantry; Undo puts it back once. | pantry +1 then back; no duplicate | [ ] |
| F10 | Clear ticked | Tick two, "Clear ticked". | Both gone from the list. | rows removed / closed | [ ] |
| F11 | Recipe feed | Home > "Cook from your pantry". | Cards with "Ready to cook" (leaf) or "N missing" (banana). | none | [ ] |
| F12 | Recipe page | Open a card. | Ingredients, steps, heart. | none | [ ] |
| F13 | Add missing to grocery | On a recipe with missing items: "Add N missing to grocery list". Press again. | Items on the list once; the second press adds nothing. | rows merged, once per recipe | [ ] |
| F14 | Search | Home > Search: a title, then an ingredient. | Own recipes first, then recipes and creator videos mixed, no repeats. | none | [ ] |
| F15 | Saved | Heart a recipe; open Home > Saved. Unheart. | Shows in Saved; gone after unheart. | `user_saved_recipes` row added / removed | [ ] |
| F16 | Import from link | Home > Import a recipe > paste a recipe link > review > Save. | Opens the new recipe page; imports-left drops by 1. | own `recipes` row, `is_master = false`, source credit | [ ] |
| F17 | Import from photo / video | Import a recipe photo; a saved video (test 9 covers video). | Review form filled; saves. | as F16 | [ ] |
| F18 | Creators | Home > "See all creator videos". Tap a video. | Recent videos; opens YouTube outside the app ("Watch on YouTube"). | none | [ ] |
| F19 | Ask Forky | Tap Forky in the top bar; ask "what can I cook?". | Answer with recipe buttons that open `/recipe/<id>`. AI notice always on screen. "N messages left this month" drops by 1. | `forky_chat_usage` +1 | [ ] |
| F20 | Header tips | Use the app for a few minutes. | Forky shows a short tip now and then; dismissing it makes tips rarer. | none | [ ] |
| F21 | Usage | Home > Plans & usage > "Usage this month". | Scans, imports, questions as "N of M used". Matches tests above. | matches counters | [ ] |
| F22 | Stores | Stores tab > "Use my location" (or ZIP). | Nearby stores, chains first; Directions and Weekly ad links open; "More local markets". | none | [ ] |
| F23 | Store favourite | Tap "Save" on a store; reload. | Still "Saved". | favourite row | [ ] |
| F24 | Kroger stores | ZIP near a Kroger-family store. | Kroger locations merged in. | none | [ ] |
| F25 | Account deletion | (Covered in test 8, on a throwaway.) | | | [ ] |
| F26 | Deep link | Open `https://<preview>/pantry` directly in a new tab. | Pantry opens (not a 404). | none | [ ] |
| F27 | Legal links | Sign-up screen and `/plans`: tap Terms and Privacy Policy. | Both pages open. | none | [ ] |

---

## 3. Compliance check of money screens

Money screens in the new app: `/plans` (`app/src/plans/PlansScreen.tsx`, `PlanChoice.tsx`), `/usage`, the scan / import / Forky limit sheets, the Stripe checkout and portal pages.

Approved wording lives in `app/src/plans/copy.ts` (lines marked LIVE, copied word for word from the live app, compliance-approved in #252: terms `2026-10-11`, disclosure `2026-10-11.1`). Lines marked NEW have not been through compliance.

For each, compliance ticks the box:

- [ ] **Renewal line directly above the buy button**, normal-size text, word for word the server's `renewalDisclosure` (`_shared/billingText.ts`):
  > MealPlanatic Pro is $8.99 a month. It renews automatically every month until you cancel. Cancel any time in Account, Manage subscription.
  - Check all 6 (3 plans x monthly / yearly).
- [ ] **"Cancel any time in Account, Manage subscription."** The new app has **no Account screen**: "Manage subscription" is on Home > Plans & usage. The wording no longer says where to go. Compliance decides: add an Account entry, or approve new wording (that means a new disclosure version on the server too). **Open item.**
- [ ] Buy button says what it does and the price: "Subscribe for $8.99 a month" (`tierSubscribeLabel`).
- [ ] Limits sentence above the renewal line: "MealPlanatic Pro: 25 scans, 10 recipe imports and 30 Ask Forky questions a month."
- [ ] "See Terms." link right after the renewal terms; Terms and Privacy Policy links on the page.
- [ ] Nothing pre-ticked beyond the plan choice. The unticked renewal consent box is on Stripe's page (set by `stripe-checkout`).
- [ ] No savings claims: yearly shows "$53.88 a year" only, no "save %", no "2 months free". No countdowns or pressure words.
- [ ] **Tomato only for camera or money.** Checked in code 2026-10-14: the only filled tomato button is the buy button (`kind="purchase"` in `PlanChoice.tsx`); tomato is also on the Scan button outline / camera icon and the "Plan" in the wordmark (brand). Confirm on screen.
- [ ] Status lines word for word: "Renews on <date>.", "Your plan ends on <date>. You will not be charged again.", "Your last payment did not go through. Update your card in Manage subscription to keep your plan."
- [ ] Comped plan: "This plan is on for your account. There is no subscription and nothing to pay."
- [ ] Phone (native) builds: no buying. Shows "Paid plans with more scans, imports and questions are not sold on this platform yet." (`PlansScreen.tsx` sells on web only.)
- [ ] Page title "Plans" (NEW; the live title "Pick a plan" was itself "compliance to confirm").
- [ ] Usage screen (NEW wording, counts only, no price or renewal words): confirm.
- [ ] Limit sheets (scan, import, Ask Forky): offer the plans, no savings or pressure wording.
- [ ] Ask Forky AI notice on screen at all times (chatbot disclosure).
- [ ] Sign-up: 18+ box, "18 or older" wording, links to Terms and Privacy.
- [ ] Receipt scan line "The photo is read, then not kept." matches the privacy page. (not verified against `privacy.html`)
- [ ] Store data credit: the spec notes the current wording is known to be wrong and compliance must supply it. **Open item** (not money, but a legal line).

---

## 4. The merge and release (in order)

1. **Owner:** all of section 2 ticked; section 3 signed off. Open items closed or accepted in writing.
2. **Manager:** confirms every PR into `rebuild/v1` is merged and green: the `main`-into-`rebuild/v1` update (1a), the switch-over PR (1b), account deletion.
3. **Owner:** Supabase Redirect URLs (1d).
4. **Manager:** opens the final PR `rebuild/v1` into `main`. In the same PR: `mobile/` deleted, functions in `supabase/functions`, new `pages.yml`, CI changes. Lists the last `main` commit before the merge (the rollback point).
5. **Manager:** all checks green on that PR's head.
6. **Owner:** merges, at a quiet hour (no live paying customers yet per status; confirm).
7. Pages workflow runs on push to `main`. **Manager** watches it to green (about 3 to 5 minutes).
8. Edge functions are **not** redeployed by the merge. Live functions keep running as they are. No function change is part of this release.

---

## 5. Right after release (smoke checks, about 15 minutes)

On the owner's phone and a desktop browser, at https://mealplanatic.app:

- [ ] Home loads the **new** app. No "Preview build" bar. Home card shows "Build <sha>" of the merge.
- [ ] A phone that used the old app: open it, close it, open again. New app shows. (Service worker clean-up.)
- [ ] Sign in with the owner's account. Pantry, grocery and saved recipes are all there (same data).
- [ ] `/pantry` opened directly: works.
- [ ] `/terms.html`, `/privacy.html`, `/terms/`, `/privacy/`: all open.
- [ ] `/delete-account`: opens the deletion screen.
- [ ] `/209/` and `/app/` redirects: work.
- [ ] Old links `/recipes`, `/smart-shop`, `/discover-recipes`: land on the new screens.
- [ ] `/plans`: prices and renewal lines as in test 1.
- [ ] One test-mode purchase is NOT needed again unless the owner wants it; a read of `/plans` and Manage subscription opening is enough.
- [ ] Forgot password email link opens `/reset-password` on mealplanatic.app.
- [ ] Function logs (manager, read-only): no new errors in `pantry-vision`, `ask-forky`, `recipe-import`, `stripe-*` for 1 hour.
- [ ] Actions > Deploy Supabase function: run once for one function to prove the new `supabase/functions` path (owner). Pick one that is unchanged.

---

## 6. Rollback

If the new app breaks after the merge:

1. **Owner:** on GitHub, open the merge commit on `main` > "Revert". Merge the revert PR. (Or the manager opens it; the owner merges.)
2. Pages workflow rebuilds `mobile/` and puts the old app back (about 5 minutes). If the revert misses `pages.yml`, run "Deploy GitHub Pages" by hand (Actions, `workflow_dispatch`).
3. Faster stop-gap (not verified): GitHub > Settings > Pages / Deployments, re-run the previous successful Pages deployment.
4. Phones that loaded the new app get the old app on their next open; the old app registers its own service worker again. (not verified)

**Data risk from the app switch itself: none.** Same database, no migration in the release.

Database changes already on live, checked against the old app:

- `tick_grocery_item` / `untick_grocery_item` (`20261014000000_grocery_tick.sql`): new functions only. The old app does not call them. Safe.
- `recipes_read` master + own (`20261014080000_recipes_read_own.sql`): the migration notes both apps already query master + own. Old app unaffected. (Checked in the migration comment, not by running the old app.)
- `add_missing_to_grocery` (applied 2026-10-14): new function only. Old app does not call it. Safe.
- Saved recipes use the same `user_saved_recipes` keys in both apps, so saves made in the new app show in the old one.

Rollback keeps `supabase/functions` in the reverted state too, so the deploy workflow points at `mobile/` again. That is fine.

---

## 7. Owner switches still open

From the spec and the "Do list". None needs code.

- [ ] **Scan-photo deletion job (PR #260):** merged to `main` 2026-10-13. The five owner steps in the PR (secret, deploy `scan-photo-retention`, vault secret, run the migration) must be done **before about Oct 31**, when the oldest photo passes 30 days. Not verified whether any are done.
- [ ] **Spend caps** on the Gemini and Anthropic API keys.
- [ ] **Leaked-password protection** (Supabase Auth).
- [ ] **Database backups** (paid Supabase plan, about $25 a month).
- [ ] **Enforce HTTPS** on GitHub Pages (Do list).
- [ ] Stripe live settings: yearly renewal reminder and price-change emails promised in the terms.
- [ ] Go-live steps (old `mobile/docs/GO_LIVE.md`, still names $6.99 and $60): live prices (six), live webhook, clear test rows, switch keys, one real purchase and refund. Move the updated list out of `mobile/` before it is deleted.

---

## Top risks found while writing this

1. **Function sources live in `mobile/`.** Deleting `mobile/` without the move in 1b loses the only copy of 14 live functions and breaks the deploy workflow.
2. **Guard tests skip silently.** Six `app/tests` read `mobile/` files and skip when they are missing, and 17 function checks run only in the old `mobile` CI job. Prices and renewal wording could drift with CI still green.
3. **`/delete-account` and the legal pages.** The privacy page promises `/delete-account`; the new app does not have it yet. `terms.html` and `privacy.html` must be copied into `app/public`.
4. ~~`add_missing_to_grocery` is not on live.~~ Done 2026-10-14.
5. **Renewal wording says "Account, Manage subscription"**, and the new app has no Account screen. Compliance decision needed.

Also: PR #260 is on `main` but not on `rebuild/v1` (1a); the old service worker on users' phones (1b); no admin screen in the new app (old `/admin` route disappears; not verified what the owner still uses it for).
