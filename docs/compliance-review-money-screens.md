# Compliance review packet: money screens (new app)

For `SWITCHOVER.md` section 3. Prepared 2026-10-14 from `rebuild/v1` at `bb2e2f0`. Docs only: nothing in the app, the database or Stripe was changed.

## What this is

Every money-related screen and line in the new app (`app/`), next to the approved source it came from, with a verdict. Approved sources are the live app (`mobile/`), which compliance saw with the tier build (#252: terms `2026-10-11`, disclosure `2026-10-11.1`), the live functions (`supabase/functions/`) and the legal pages.

## How to use it (about 15 minutes)

1. Read "Top decisions" below. They are the only items that need thought.
2. Rows marked **Exact** were copied word for word, and most are checked by a test. Skim them.
3. For each **Differs**, **New** or **Missing** row, write one word in the Decision column: **Approve**, **Change** (say to what) or **Question**.
4. Do the "Rule checks" section (Pass / Fail / Needs a look).
5. Sign at the bottom. Then the owner ticks section 3 in `SWITCHOVER.md`.

**Who signs:** the owner (David Jones) and the compliance reviewer.

**Match words:** **Exact** = word for word the approved text. **Differs** = an approved text exists, the app says something else. **New** = no approved source (not yet approved). **Missing** = approved text in the live app with no equivalent in the new app.

**Screenshots** are on branch `phone-screens-pr-292` (phone pass of `4e1cf48`, iPhone 393 px wide). They are written below as `292: iphone/17-plans.png`. Branch `phone-screens-pr-293` has the same set (only test emails differ). All screenshots are of a **free** test account on the **web** build, so the paid-only lines (Manage subscription, status lines) and the used-up states do not appear in any screenshot.

## Totals

| Match | Rows |
|---|---|
| Exact | 60 |
| Differs | 9 |
| New, not yet approved | 22 |
| Missing | 1 |
| Not rated (repeat of section 3; Stripe's own portal text) | 2 |
| **Total** | **94** |

## Top decisions

1. **Ask Forky counter says "messages", everything else says "questions".** App: "4 messages left this month". Live app: "4 questions left". Terms and the Plans screen: "Ask Forky questions". Suggest **Change** to "4 questions left this month" / "No questions left this month" (app code, one line, `app/src/forky/copy.ts`). Row 7.21.
2. **Delete-account lines say "MealPlanatic Plus" only.** Pro and Family have been sold since 2026-10-11. The lines are live-approved and the delete function really cancels any tier (test 2026-10-14: subscribed account deleted, Stripe subscription cancelled, webhook 200). But a Pro or Family customer reads "cancels MealPlanatic Plus". Suggest **Question**: approve as is for switch-over, or change to "your paid plan" (needs the live app and the delete function changed first, then copied). Rows 6.2, 6.5, 6.13.
3. **Plans screen shows "Could not start checkout. Please try again." when the plan cannot be loaded** (before any checkout). Approved words, wrong place. Suggest **Change** to a load-error line (for example the Usage screen's "Could not load your usage. Please try again." reworded for the plan). Row 1.6.
4. **"Free: …" line on the buy area.** Live app: "Free stays free: 3 scans, …" (itself marked "compliance to confirm"). New app: "Free: 3 scans, 2 recipe imports and 5 Ask Forky questions a month.", which is word for word the terms page. Suggest **Approve**. Row 2.9.
5. **Used-up notes for scans and imports reword the server's approved sentences** ("You've used … They start again on the 1st." vs the functions' "You have used … for this month. They reset on the 1st."). Meaning is the same. Suggest **Approve**, or **Change** to the server's exact words. Rows 7.3, 7.4, 7.13, 7.14.
6. **No message after coming back from Stripe.** The live app said "Checkout closed. You have not been charged." and "You're on a paid MealPlanatic plan. Your new monthly limits are ready." The new app shows nothing. Not a legal requirement (Stripe's page carries the terms and the receipt), but it is approved wording that was dropped. Suggest **Question**: port it after switch-over? Row 8.7.

## Fixes built (owner approved 2026-10-15), waiting for compliance sign-off

PR `rebuild/compliance-fixes`. Lines marked NEW need a compliance yes before switch-over.

| Decision | What changed | Status |
|---|---|---|
| 1 (row 7.21) | Ask Forky counter: "4 questions left this month", "1 question left this month", "No questions left this month" | NEW wording ("this month" ending) |
| 2 | Delete page: "…also cancels your MealPlanatic plan and stops future charges." Confirm step: "If you have a paid MealPlanatic plan, it is cancelled now and you will not be charged again." The server's CANCEL_FAILED line still says "MealPlanatic Plus": changing it needs a function deploy, so it is left for a separate, owner-run step. | NEW wording |
| 3 | Plan or subscription fails to load (Plans, Account): "Couldn't load your plan. Please try again." Checkout errors keep "Could not start checkout. Please try again." | NEW wording (no money words) |
| 6 | After Stripe: the live app's three lines restored word for word (cancelled, unlocked, pending), shown once, then the marker is removed from the address | LIVE wording, unchanged |
| Privacy page | "avatar → Account → Delete account" became "Home → Account → Delete account" (app/public and mobile/public, identical). "Last updated" date not changed: compliance to say if it should be. | Legal page change, needs approval |

## Sources and checks, short names

| Short name | File |
|---|---|
| live pricing | `mobile/config/pricing.ts` (`PLUS_UPGRADE_COPY`, `CHECKOUT_RETURN_COPY`) |
| live account | `mobile/config/account.ts` (`ACCOUNT_SHEET_COPY`, `ACCOUNT_UPGRADE_COPY`) |
| live plan section | `mobile/components/account/AccountPlanSection.tsx` |
| live buy options | `mobile/components/billing/PlusUpgradeOptions.tsx` |
| live billing pricing | `mobile/lib/billing/pricing.ts` |
| live tiers | `mobile/config/planTiers.ts` and `supabase/functions/_shared/planTiers.ts` |
| live delete page | `mobile/app/delete-account.tsx`, `mobile/lib/account/deleteAccount.ts` |
| live Forky | `mobile/config/askForky.ts` |
| billingText | `supabase/functions/_shared/billingText.ts` (`renewalDisclosure`, `consentCheckboxText`, versions) |
| pantry-vision | `supabase/functions/pantry-vision/index.ts` (scan refusals) |
| importAllowance | `supabase/functions/recipe-import/importAllowance.ts` (import refusals) |
| delete function | `supabase/functions/delete-user-account/index.ts` |
| terms / privacy | `app/public/terms.html`, `app/public/privacy.html` (byte-identical to `mobile/public/` today) |

| Check | What it guards | Runs in |
|---|---|---|
| PP | `app/tests/plans-pricing.test.ts`: each LIVE plans line is still in the live app files; renewal line equals `billingText`; disclosure version `2026-10-11.1`; the six prices; no pressure or savings words | app CI |
| AC | `app/tests/account-copy.test.ts`: delete-account lines still in the live app and the delete function | app CI |
| ASC | `app/tests/account-screen-copy.test.ts`: renewal line ends "Cancel any time in Account, Manage subscription." and those match the Account title and button | app CI |
| SPT | `app/tests/scan-planTiers.test.ts`: app tier table is the server's file verbatim; published numbers | app CI |
| FR | `app/tests/forky-request.test.ts`: Forky limit lines still in the live app | app CI |
| PTC | `supabase/scripts/plan-tiers-check.ts`: server limits table | functions CI |
| SCC | `supabase/scripts/stripe-checkout-check.ts`: checkout wording, required consent box, versions in metadata | functions CI |
| MOB | `mobile/scripts/plan-tiers-mobile-check.ts`, `stripe-checkout-mobile-check.ts`, `legal-pages-check.ts`: terms page numbers and date | old `mobile` CI job only; reads `mobile/public/`, **not** `app/public/` |
| Pin | a unit test fixes the new app's own text, with no approved source to compare to | app CI |
| Tomato | phone pass layout check: every tomato element is camera, money or brand (`292: iphone/*.json`, `tomatoViolations: []` on all 25 screens) | phone pass (iPhone report-only, Android blocking) |

Note: PP, AC, FR read `mobile/`. They fail (not skip) when `mobile/` is gone, so they must be repointed or snapshotted in the switch-over PR (`SWITCHOVER.md` 1b).

---

## 1. Plans screen (`/plans`)

Code: `app/src/plans/PlansScreen.tsx`, `app/src/plans/copy.ts`. Screenshots: `292: iphone/17-plans.png`, `292: iphone/17-plans-bottom.png`.

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 1.1 | Title "Plans" | live pricing `screenTitle`: "Pick a plan" (marked "compliance to confirm") | **New** | Pin (PP: no pressure words) | 17-plans | Neutral title. Suggest Approve. | |
| 1.2 | "Close" | live pricing `close`: "Close" | **Exact** | No | 17-plans | Closing is one tap. | |
| 1.3 | "Scan your fridge, pantry and receipts with your camera, import recipes from links and videos, and ask Forky what to cook. A paid plan gives you more of each every month." | live pricing `benefit` | **Exact** | PP | 17-plans | | |
| 1.4 | Links "Usage this month", "Terms", "Privacy Policy" | none (Terms / Privacy Policy match the legal page names) | **New** | No | 17-plans-bottom | Link labels only. Suggest Approve. | |
| 1.5 | Loading (screen reader): "Loading your plan…" | live `mobile/config/plans.ts`: "Loading your plan… try again in a moment." (different screen) | **New** | No | not shown | Suggest Approve. | |
| 1.6 | Plan could not load: "Could not start checkout. Please try again." | live pricing `genericError` (meant for a failed checkout) | **Differs** (right words, wrong place) | PP (text only) | not shown | Shown before any checkout. See top decision 3. Same on Account (5.3). | |

## 2. Plan choice and buy button

Code: `app/src/plans/PlanChoice.tsx`, `app/src/plans/pricing.ts`, prices from `app/src/scan/planTiers.ts`. Screenshots: `17-plans.png`, `17-plans-bottom.png`.

Approved prices and limits (all match the app, the server and the terms page):

| Plan | Scans / imports / Forky a month | Monthly | Yearly |
|---|---|---|---|
| Free | 3 / 2 / 5 | - | - |
| Plus | 15 / 5 / 15 | $4.99 | $53.88 |
| Pro | 25 / 10 / 30 | $8.99 | $93.84 |
| Family | 50 / 25 / 60 | $20 | $192 |

Paid plans also include 200 store price-tag scans a month (terms page). The app does not show that number anywhere; price-tag scans are not in v1.

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 2.1 | "Pay yearly" / "Pay monthly", yearly chosen first | live pricing `payYearly`, `payMonthly`, `PLUS_INTERVAL_ORDER` (year first) | **Exact** | PP | 17-plans | Same default as live. | |
| 2.2 | Screen reader group labels "Choose a plan", "Pay monthly or yearly" | live pricing `tierChoiceLabel`, `intervalChoiceLabel` | **Exact** | PP | n/a | | |
| 2.3 | Row names "Plus", "Pro", "Family" | live tiers `TIER_SHORT_NAMES` | **Exact** | No | 17-plans-bottom | | |
| 2.4 | Row prices "$53.88 a year", "$93.84 a year", "$192 a year" (and "$4.99 a month", "$8.99 a month", "$20 a month") | live billing pricing `tierPriceLabel`; terms "Plans and prices" | **Exact** | PP, SPT; server refuses checkout if Stripe's price differs (`stripe-checkout/index.ts` line 189) | 17-plans-bottom (yearly only) | Monthly not on a screenshot (not verified on screen). | |
| 2.5 | Row limits "15 scans, 5 recipe imports and 15 Ask Forky questions a month" (one per plan) | live tiers `tierLimitsLine`; terms | **Exact** | PP, SPT, PTC; terms numbers MOB | 17-plans-bottom | | |
| 2.6 | Screen reader row label "MealPlanatic Plus, $53.88 a year: 15 scans, …" | live buy options `accessibilityLabel` | **Exact** | PP (pressure words only) | n/a | | |
| 2.7 | Selected-plan sentence "MealPlanatic Plus: 15 scans, 5 recipe imports and 15 Ask Forky questions a month." | live buy options `{TIER_NAMES[tier]}: {tierLimitsLine(tier)}.` | **Exact** | Numbers only (PP) | 17-plans-bottom | Sits directly above the renewal line. | |
| 2.8 | Renewal line "MealPlanatic Plus is $53.88 a year. It renews automatically every year until you cancel. Cancel any time in Account, Manage subscription." (6 versions: 3 plans x 2 periods) | billingText `renewalDisclosure` (version `2026-10-11.1`); live billing pricing | **Exact** | PP (against server and live app), ASC | 17-plans-bottom (Plus yearly) | Other 5 versions not on a screenshot (not verified on screen); PP checks all 6 in code. | |
| 2.9 | "Free: 3 scans, 2 recipe imports and 5 Ask Forky questions a month." | live buy options: "Free stays free: 3 scans, …" (`freePlanLead`, marked "compliance to confirm"). Terms: "Free: 3 scans, 2 recipe imports and 5 Ask Forky questions a month." | **Differs** from live app; word for word the terms | No | 17-plans-bottom | Top decision 4. Suggest Approve. | |
| 2.10 | "See Terms." (link, right after the renewal line) | live pricing `termsLinkLabel` | **Exact** | PP | 17-plans-bottom | | |
| 2.11 | Buy button "Subscribe for $53.88 a year" (tomato) | live billing pricing `tierSubscribeLabel` | **Exact** | PP, Tomato | 17-plans-bottom | Only filled tomato button in the app. | |
| 2.12 | While starting: "Opening secure checkout…" | live pricing `starting` | **Exact** | PP | not shown | Owner test: double tap opened one checkout. | |
| 2.13 | Errors: "You already have a MealPlanatic plan. Use Manage subscription to make changes." / "This plan is not available to buy yet. Please check back soon." / "Create a free account or sign in first, so your plan stays with you on every device." / "Could not start checkout. Please try again." | live pricing `alreadySubscribed`, `notConfigured`, `signInHint`, `genericError` | **Exact** | PP | not shown | Server messages are never shown raw (`billingErrorMessage`). | |

Dropped from the live buy sheet, nothing needed: heading "MealPlanatic Plus", "Not now", "Sign in to upgrade" (the new screen is a page with Close, and a signed-out visitor is sent to sign-in).

## 3. Current plan card (on Plans and on Account)

Code: `app/src/plans/CurrentPlan.tsx`. Screenshots: `17-plans.png`, `292: iphone/19-account.png`.

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 3.1 | Label "Plan" | live plan section | **Exact** | PP | 17-plans, 19-account | | |
| 3.2 | Plan name "Free" / "MealPlanatic Plus" / "MealPlanatic Pro" / "MealPlanatic Family" | live tiers `TIER_NAMES` | **Exact** | SPT | 17-plans ("Free") | | |
| 3.3 | "Includes 3 scans, 2 recipe imports and 5 Ask Forky questions a month." | live plan section `Includes ${tierLimitsLine(...)}.` | **Exact** | No (numbers via SPT) | 17-plans, 19-account | | |
| 3.4 | Free, web: "Manual pantry and recipes are free. A paid plan includes more scans, imports and questions each month." | live account `freeBlurb` | **Exact** | PP | 17-plans, 19-account | | |
| 3.5 | Free, phone build: "Manual pantry and recipes are free. Paid plans with more scans, imports and questions are not sold on this platform yet." | live account `freeBlurbNativeNoBilling` | **Exact** | PP | not shown (web only) | Phone builds sell nothing (`canBuyHere` is web only). | |
| 3.6 | Paid: "Limits start again on the 1st of each month." | live account `paidBlurb` | **Exact** | PP | not shown here (same line on 18-usage) | | |
| 3.7 | Comped: "This plan is on for your account. There is no subscription and nothing to pay." (after 3.6) | live pricing `compedBlurb` | **Exact** | PP | not shown | | |
| 3.8 | "Renews on <date>." | live plan section | **Exact** | PP | not shown | | |
| 3.9 | "Your plan ends on <date>. You will not be charged again." | live plan section | **Exact** | PP | not shown | Owner test 2026-10-14: cancel kept the plan to period end (screen text not verified). | |
| 3.10 | "Your last payment did not go through. Update your card in Manage subscription to keep your plan." | live plan section | **Exact** | PP | not shown | | |
| 3.11 | Button "Manage subscription" (ink, not tomato), only with a live subscription | live pricing `manage` | **Exact** | PP, ASC | not shown (free account) | | |
| 3.12 | "Cancel, update your card or see invoices." (under the button and as its hint) | live pricing `manageHint`, shown the same way in the live plan section | **Exact** | PP | not shown | | |
| 3.13 | "Opening billing…" / "Could not open billing. Please try again." | live pricing `managing`, `manageError` | **Exact** | PP | not shown | | |

## 4. Usage screen (`/usage`)

Code: `app/src/plans/UsageScreen.tsx`, `USAGE_COPY` in `copy.ts`. Screenshot: `292: iphone/18-usage.png`. Counts only: no price, renewal or cancel words.

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 4.1 | Title "Usage" | none | **New** | No | 18-usage | Suggest Approve. | |
| 4.2 | "What you have used this month, out of what your plan includes." | none | **New** | No | 18-usage | Suggest Approve. | |
| 4.3 | Plan name ("Free") | live tiers `TIER_NAMES` | **Exact** | SPT | 18-usage | | |
| 4.4 | Row titles "Photo scans", "Recipe imports", "Ask Forky questions" | none (terms say "scans", "recipe imports", "Ask Forky questions") | **New** | No | 18-usage | Suggest Approve. | |
| 4.5 | "0 of 3 used" / "3 left this month" | none | **New** | Pin (`plans-usage.test.ts`) | 18-usage | Suggest Approve. | |
| 4.6 | "Shelf, fridge and receipt photos share them." | none (terms: a scan is a photo of "a pantry shelf, fridge or grocery receipt") | **New** | No | 18-usage | Spice rack is a scan type in the app but not in the terms definition (see rule checks). | |
| 4.7 | "Limits start again on the 1st of each month." | live account `paidBlurb` | **Exact** | PP | 18-usage | Shown to free accounts too; true for them (terms: every plan resets monthly). | |
| 4.8 | Link "Plans" | none | **New** | No | 18-usage | | |
| 4.9 | Error "Could not load your usage. Please try again." / "Try again" | none | **New** | No | not shown | | |

## 5. Account screen (`/account`, the "Account, Manage subscription" in the renewal line)

Code: `app/src/account/AccountScreen.tsx`, `ACCOUNT_SCREEN_COPY`. Screenshot: `19-account.png` (free account, so no Manage subscription button). Reached from the "Account" link at the bottom of Home (`292: iphone/04-home-bottom.png`).

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 5.1 | Title "Account" (also the Home link) | live account `accountTitle`: "Account" | **Exact** | ASC | 19-account, 04-home-bottom | `copy.ts` calls it NEW; the live account sheet had the same title. | |
| 5.2 | Current plan card with Manage subscription | section 3 | (see 3) | PP, ASC | 19-account | Same component and rules as Plans. | |
| 5.3 | Plan could not load: "Could not start checkout. Please try again." | live pricing `genericError` | **Differs** (wrong place) | PP (text only) | not shown | Same as 1.6. | |
| 5.4 | Link "Plans & usage" | none in the live app (new app's earlier Home link) | **New** | ASC (pins text) | 19-account | Suggest Approve. | |
| 5.5 | Link "Delete account" | live account `deleteAccount` | **Exact** | AC, ASC | 19-account | | |

## 6. Delete account (`/delete-account`)

Code: `app/src/account/DeleteAccountScreen.tsx`, `ACCOUNT_DELETE_COPY`, `ACCOUNT_DELETE_ERRORS`. Screenshots: `292: iphone/20-delete-account.png`, `292: iphone/21-delete-account-confirm.png`.

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 6.1 | Title "Delete your MealPlanatic account" | live delete page | **Exact** | AC | 20 | | |
| 6.2 | "You can permanently delete your account … Deleting your account also cancels MealPlanatic Plus and stops future charges." | live delete page | **Exact** | AC | 20 | Says Plus only. Top decision 2. | |
| 6.3 | Button "Delete account" | live account `deleteAccount` | **Exact** | AC | 20 | Ink outline, not red or tomato. | |
| 6.4 | Confirm title "Delete your account?" | live account | **Exact** | AC | 21 | | |
| 6.5 | "This permanently removes your pantry, recipes, grocery list, meal plan, and profile. If you have MealPlanatic Plus, it is cancelled now and you will not be charged again. Community store prices you shared may stay visible without your name. This cannot be undone." | live account `deleteAccountConfirmBody` | **Exact** | AC | 21 | Plus only (top decision 2). Says nothing about refunds; terms say time left is not refunded. Not required on screen (not verified with compliance). | |
| 6.6 | "Yes, delete my account" / "Cancel" | live account | **Exact** | AC | 21 (button) | | |
| 6.7 | Busy: "Deleting your account…" | none | **New** | No | not shown | Suggest Approve. | |
| 6.8 | Signed out: "Sign in to delete your account from this page." / "Sign in" | live delete page | **Exact** | AC | not shown | | |
| 6.9 | After deleting: "Your account and personal data have been deleted." | live delete page | **Exact** | AC | not shown | | |
| 6.10 | "Need help? Email support@mealplanatic.app from the address on your account and we will process your request." / "Privacy Policy" | live delete page, `mobile/config/support.ts` | **Exact** | AC | 20 | | |
| 6.11 | Errors "Sign in to delete your account." / "App is not configured for account deletion." / "Could not delete account. Try again or contact support." | live `deleteAccount.ts` | **Exact** | AC | not shown | | |
| 6.12 | Network error "Couldn't reach the server. Check your connection and try again." | new app `src/data/errors.ts` | **New** | No | not shown | The live app showed the browser's own error. Suggest Approve. | |
| 6.13 | "We could not cancel your MealPlanatic Plus subscription, so your account was not deleted. Try again in a few minutes, or cancel in Account, Manage subscription first." | delete function `CANCEL_FAILED` | **Exact** | AC, ASC | not shown | Plus only (top decision 2). Points to Account, Manage subscription, which now exists. | |

## 7. Limits and out-of-allowance messages (Scan, Import, Ask Forky)

All say what the allowance is and where plans are. None mention a price.

### Scan

Code: `app/src/scan/allowance.ts`, `ScanLimitSheet.tsx`, `request.ts`. Screenshots: `292: iphone/08-scan.png`, `05-pantry-shelves.png`. The used-up sheet is not on any screenshot (not verified on screen).

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 7.1 | Scan button "Scan · 3 left this month" | none (live: badge "3 free" and "You have 3 free scans left this month. A paid plan includes more.") | **New** | Pin (`scan-allowance.test.ts`) | 05-pantry-shelves | Suggest Approve. | |
| 7.2 | Scan screen "3 of 3 scans left this month. Shelf, fridge and receipt photos share them." | none | **New** | Pin | 08-scan | Spice rack is a choice on the same screen but not named here. | |
| 7.3 | Used up, free: "You've used your 3 free scans this month. They start again on the 1st. A paid plan includes more." | pantry-vision: "You have used your 3 free scans for this month. They reset on the 1st. A paid plan includes more." | **Differs** (reworded) | Pin | not shown | Top decision 5. | |
| 7.4 | Used up, paid: "You've used all 15 scans this month. They start again on the 1st." | pantry-vision: "You have used all 15 scans for this month. They reset on the 1st." | **Differs** (reworded) | Pin | not shown | Top decision 5. | |
| 7.5 | Server refused a scan: the function's own sentence is shown as is | pantry-vision (same text as in 7.3, 7.4) | **Exact** | No | not shown | | |
| 7.6 | Fallback when the server gives no sentence: "You've used this month's scans. They start again on the 1st." | none | **New** | No | not shown | | |
| 7.7 | Sheet title and button "No scans left this month" | none | **New** | Pin | not shown | | |
| 7.8 | "Your plan includes 3 photo scans a month. Shelf, fridge, spice rack and receipt photos share them." | none (live card: "A free account has a few scans each month. …") | **New** | Pin | not shown | Names spice rack; terms do not. Flagged in #276 as "shortened scan-sheet line". | |
| 7.9 | "Your scans start again on the 1st. You can still add items by hand." | none (live: "Manual entry stays free.") | **New** | Pin | not shown | | |
| 7.10 | "Paid plans include more scans." | none (live: "Upgrade to a paid plan for more scans of shelves and receipts.") | **New** | Pin | not shown | No pressure words. | |
| 7.11 | "See plans" (ink outline button, goes to `/plans`) / "Close" | live Forky `seePlus`: "See plans" | **Exact** | No | not shown | | |

### Recipe import

Code: `app/src/recipes/import/allowance.ts`, `request.ts`, `ImportScreen.tsx`. Screenshot: `292: iphone/13-recipe-import.png`.

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 7.12 | Button "Import · 2 imports left this month" / "No imports left this month" | none | **New** | Pin (`recipe-import-allowance.test.ts`) | 13-recipe-import | Suggest Approve. | |
| 7.13 | Used up, free: "You've used your 2 free recipe imports this month. They start again on the 1st. A paid plan includes more." | importAllowance: "You have used your 2 free recipe imports for this month. They reset on the 1st. A paid plan includes more." | **Differs** (reworded) | Pin | not shown | Top decision 5. No "See plans" link here, unlike Scan and Forky (consistency, not compliance). | |
| 7.14 | Used up, paid: "You've used all 5 recipe imports this month. They start again on the 1st." | importAllowance: "You have used all 5 recipe imports for this month. They reset on the 1st." | **Differs** (reworded) | Pin | not shown | Top decision 5. | |
| 7.15 | Server refused an import: the function's own sentence shown as is | importAllowance | **Exact** | No | not shown | | |
| 7.16 | Fallback: "You've used this month's recipe imports. They start again on the 1st." | none | **New** | No | not shown | | |

### Ask Forky

Code: `app/src/forky/copy.ts`, `ForkyChatScreen.tsx`. Screenshot: `292: iphone/15-forky-answer.png`.

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 7.17 | Used up, free: "That's all the free questions for this month. They refill on the 1st, and a paid plan includes more." | live Forky `limitFree` | **Exact** | FR | not shown | | |
| 7.18 | Used up, paid: "You've used this month's questions. They refill on the 1st." | live Forky `limitPlus` | **Exact** | FR | not shown | | |
| 7.19 | "See plans" (goes to `/plans`) | live Forky `seePlus` | **Exact** | No | not shown | | |
| 7.20 | AI notice "Forky is an AI helper and can be wrong. Always check allergens and food safety yourself before you cook." | live Forky `aiNotice` | **Exact** | FR | 15-forky-answer | Not money; listed because section 3 asks for it. | |
| 7.21 | Counter "4 messages left this month" / "No messages left this month" | live Forky `remaining`: "4 questions left" | **Differs** | Pin (FR fixes the new text) | 15-forky-answer | Top decision 1. Suggest Change to "questions". | |

## 8. Stripe checkout and portal (server, unchanged by the rebuild)

The new app sends only the plan and the period; `stripe-checkout` builds the page. Evidence: owner's phone, Stripe test mode, 2026-10-14.

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 8.1 | Text by the pay button: "MealPlanatic Plus is $53.88 a year. It renews automatically every year until you cancel. Cancel any time in Account, Manage subscription." | billingText `renewalDisclosure` (`custom_text.submit`) | **Exact** | SCC; PP (same words as the app) | live test session 2026-10-14 | Same sentence as the app's renewal line. | |
| 8.2 | Consent box: "I agree that MealPlanatic Plus renews automatically at $53.88 every year until I cancel, and I accept the Terms of Use." | billingText `consentCheckboxText` (`custom_text.terms_of_service_acceptance`) | **Exact** | SCC | live test session 2026-10-14 | | |
| 8.3 | Consent box required and unticked | `stripe-checkout/index.ts` `consent_collection: { terms_of_service: 'required' }` | **Exact** | SCC | live test session | | |
| 8.4 | Price charged equals price shown | `stripe-checkout/index.ts` line 189 refuses when Stripe's amount differs from `TIER_PRICE_CENTS` | **Exact** | code guard | - | | |
| 8.5 | Consent record: price, terms `2026-10-11`, disclosure `2026-10-11.1` | billingText `TERMS_VERSION`, `DISCLOSURE_VERSION` | **Exact** | PP, SCC | - | Owner test: one consent row, $4.99, terms 2026-10-11, disclosure 2026-10-11.1. | |
| 8.6 | Stripe portal (cancel, card, invoices) | Stripe's own pages | n/a | - | - | Stripe's wording (not verified). Owner test: cancel kept the plan to period end; declined card stayed free. | |
| 8.7 | Coming back from Stripe: nothing shown | live pricing `CHECKOUT_RETURN_COPY`: "You're on a paid MealPlanatic plan. Your new monthly limits are ready." / "Payment received. Your plan will unlock in a moment; reopen the app if it does not." / "Checkout closed. You have not been charged." | **Missing** | No | - | Top decision 6. The new app has no `?checkout=` handling. | |

## 9. Terms and Privacy money sections

`app/public/terms.html` and `privacy.html` are byte-identical to `mobile/public/` (checked 2026-10-14). Screenshots: `292: iphone/24-terms.png`, `25-privacy.png`.

| # | As shown | Approved source | Match | Checked? | Screenshot | Notes | Decision |
|---|---|---|---|---|---|---|---|
| 9.1 | Terms "Plans and prices": the four plans, limits and six prices | `mobile/public/terms.html` | **Exact** | MOB (on the `mobile/` copy only) | 24-terms | App numbers match. After `mobile/` is deleted nothing checks `app/public/terms.html`. | |
| 9.2 | "Last updated: October 11, 2026" | billingText `TERMS_VERSION` `2026-10-11` | **Exact** | MOB only | 24-terms | Same gap as 9.1. | |
| 9.3 | Renewal, cancel ("Account → Manage subscription, or by emailing support@mealplanatic.app"), no part-period refunds, price-change notice, failed payment, delete cancels | `mobile/public/terms.html` | **Exact** | MOB (legal pages) | 24-terms | Matches the app path. Promises yearly reminder emails and 7 to 30 days' price-change notice: Stripe settings, not app (not verified; `SWITCHOVER.md` section 7). | |
| 9.4 | Privacy: "Payments for paid plans are handled by Stripe. We do not see or store your full card number. We keep a record of your subscription, its price and dates." and billing records kept after deletion | `mobile/public/privacy.html` | **Exact** | MOB (legal pages) | 25-privacy | | |
| 9.5 | Privacy deletion path "(avatar → Account → Delete account)" | `mobile/public/privacy.html` | **Exact** text, **wrong path** in the new app | No | 25-privacy | New app: Home → Account (link at the bottom) → Delete account. There is no avatar menu. Needs a privacy page edit or an avatar entry (see rule checks). Counted under Exact. | |
| 9.6 | 18+: terms "You must be 18 or older to use MealPlanatic."; privacy "not intended for anyone under 18" | live pages | **Exact** | MOB | 24, 25 | | |
| 9.7 | Sign-up box "I confirm I am 18 or older and agree to the Terms and Privacy Policy." (unticked, required) | live sign-up note: "By creating an account you confirm you are 18 or older and agree to the Terms and Privacy Policy." | **Differs** (same words, first person, now a tick box) | `auth-logic.test.ts` (box required) | 292: iphone/02-sign-up-18plus.png | Suggest Approve. | |

---

## New strings needing approval

Every money-related line with no approved source. Suggested decision in brackets.

| Where | String | Suggested |
|---|---|---|
| Plans | Title "Plans" | Approve |
| Plans | Links "Usage this month", "Terms", "Privacy Policy" | Approve |
| Plans | "Loading your plan…" (screen reader) | Approve |
| Usage | "Usage", "What you have used this month, out of what your plan includes." | Approve |
| Usage | "Photo scans", "Recipe imports", "Ask Forky questions" | Approve |
| Usage | "0 of 3 used", "3 left this month" | Approve |
| Usage | "Shelf, fridge and receipt photos share them." | Approve, or add "spice rack" if the terms change |
| Usage | "Plans" link; "Could not load your usage. Please try again." / "Try again" | Approve |
| Account | "Plans & usage" | Approve |
| Delete account | "Deleting your account…" | Approve |
| Delete account | "Couldn't reach the server. Check your connection and try again." | Approve |
| Scan | "Scan · N left this month", "N of N scans left this month. Shelf, fridge and receipt photos share them." | Approve |
| Scan | "You've used this month's scans. They start again on the 1st." (fallback) | Approve |
| Scan sheet | "No scans left this month" | Approve |
| Scan sheet | "Your plan includes N photo scans a month. Shelf, fridge, spice rack and receipt photos share them." | Question (spice rack vs terms) |
| Scan sheet | "Your scans start again on the 1st. You can still add items by hand." | Approve |
| Scan sheet | "Paid plans include more scans." | Approve |
| Import | "Import · N imports left this month", "No imports left this month" | Approve |
| Import | "You've used this month's recipe imports. They start again on the 1st." (fallback) | Approve |
| Shared errors | Plain-words load errors from `app/src/data/errors.ts` (for example "Something went wrong on our side. Please try again.") can appear on Plans, Usage and Account | Approve (generic, no money words) |

Not money, listed for completeness (auth screens): "Signed in as" (NEW in `app/src/auth/copy.ts`).

## Rule checks

| Rule | Evidence | Result |
|---|---|---|
| **Approved wording verbatim** | 60 rows Exact; most guarded by PP, AC, FR, SCC. 9 differ, 22 new, 1 missing (tables above). | **Needs a look** (decide the Differs and New rows) |
| **Tomato (`#D9301A`) only for camera or money** | Phone pass checks every screen: `tomatoViolations: []` on all 25 (`292: iphone/*.json`). Tomato appears only on: the buy button (17-plans, money); Scan and photo buttons' outline and camera icon (05 to 08, 13, camera); "Plan" in the wordmark (brand). Code: `colors.tomato` used only in `ui/Button.tsx` (`purchase`), `scan/ScanButton.tsx`, `ui/TopBar.tsx`. Manage subscription, Delete account and See plans are ink. | **Pass**. Note: `DESIGN.md` still says tomato is `#C9431F`; the app uses `#D9301A` (`app/src/theme/tokens.ts`, from the live colour file). Doc drift only. The wordmark "Plan" is the documented brand exception: confirm. |
| **Renewal line directly above the buy button, normal size** | `PlanChoice.tsx`: renewal text and button share one block (`testID="purchase-block"`), body size (16 px). Screenshot 17-plans-bottom: renewal line, "See Terms.", then the button. | **Pass** |
| **Limits shown beside the price and above the buy button** | Each row shows price and limits together; the chosen plan's limits sentence sits just above the renewal line (17-plans-bottom). | **Pass** |
| **Buy button states the price** | "Subscribe for $53.88 a year" (17-plans-bottom). | **Pass** |
| **Nothing pre-ticked beyond the plan choice** | Plus and yearly start selected (same as live). No tick box in the app; Stripe's consent box is required and unticked (SCC). | **Pass** |
| **No savings claims, countdowns or pressure words** | Yearly shows "$53.88 a year" only. No "save", "%", "months free". PP test fails on such words in the renewal lines, button labels, row labels, benefit and title. Limit sheets: "Paid plans include more scans." / "a paid plan includes more" only. | **Pass**. (The live `pricing.ts` comment mentions 10%, 13%, 20% discounts; comment only, never shown.) |
| **18+** | Terms and privacy say 18 or older; sign-up box unticked and required (02-sign-up-18plus). | **Pass** (box wording is row 9.7) |
| **Cancellation path wording vs the real path** | Line says "Cancel any time in Account, Manage subscription." The app has an Account screen titled "Account" with a "Manage subscription" button when a subscription is live (ASC checks the words match). Terms say "Account → Manage subscription". `SWITCHOVER.md` section 3 still says "The new app has no Account screen": that is out of date since #284 (`871eebe`). | **Pass** on wording. **Needs a look** on findability: the only way to Account is a text link at the very bottom of Home, under the feed (04-home-bottom), and there is no avatar menu, while the privacy page says "avatar → Account → Delete account". PR #293 (`rebuild/tabs-feel`) may move it (not verified). |
| **Manage subscription only for paid, buying only on the web** | `planScreenState` in `pricing.ts`, tested in PP. Free web account: plan choice shown, no Manage (17-plans). | **Pass** (paid view not on a screenshot; owner test covered Manage and cancel) |
| **Scan definition matches the terms** | Terms: a scan is a photo of "a pantry shelf, fridge or grocery receipt". The app also offers "Spice rack" and the sheet names it (7.8). | **Needs a look**: approve spice rack as a kind of pantry shelf, or add it to the terms next time they change. |

## Known open compliance items (from repo docs)

| Item | Source | Money-screen blocker? |
|---|---|---|
| Daily caps on paid plans (Plus 5/3/8, Pro 8/5/15, Family 15/10/25 a day). Migration file only, not on live. Changes what a plan includes, so needs a terms update and compliance review before it is switched on. The Usage screen shows no daily numbers. | `db/README.md`, `SWITCHOVER.md` line 148, rebuild spec section 4 | **No**, as long as caps stay off. Blocker only if switched on. |
| Store data credit. App shows "Store data © OpenStreetMap contributors, Overture Maps Foundation"; research found no OpenStreetMap data, so the credit should name Overture only. Compliance to supply text. | `app/src/stores/copy.ts` line 34, `SWITCHOVER.md` line 274 | No (Stores tab, legal line) |
| Phone location prompt mentions "deals": "Allow MealPlanatic to use your location to find nearby grocery stores and deals." The app shows no deals in v1. | `app/app.json` line 29 (from the old app) | No (phone builds; not money, but a claim) |
| Sign-up 18+ box wording is new (first person). | `app/src/auth/copy.ts` | No (row 9.7) |
| California chatbot check for Ask Forky still open; AI notice is on screen word for word. | rebuild spec (#277 notes) | No |
| Stripe live settings: yearly renewal reminder and price-change emails the terms promise. | `SWITCHOVER.md` section 7 | **Before taking real money**, yes. Not a screen item. |
| Terms page not checked in the new app's CI after `mobile/` is deleted (9.1, 9.2), and PP, AC, FR read `mobile/`. | `SWITCHOVER.md` 1b and risk 2 | Not a wording problem today; a drift risk after switch-over. |
| Privacy page names an "avatar" path to deletion that the new app does not have. | `privacy.html`, row 9.5 | No (deletion works from Home → Account) |
| Receipt and recipe photo lines vs privacy page ("The photo is read, then deleted." on Import). | `SWITCHOVER.md` line 273 (not verified against `privacy.html` here) | No |

## Not verified

- Monthly prices and the Pro and Family renewal lines on a real screen (only Plus yearly is on a screenshot; code and PP cover all six).
- Any paid-account view (status lines, Manage subscription, comped line) on a screenshot. Owner's 2026-10-14 test covered purchase, cancel, declined card, double tap and delete, but this packet did not see those screens.
- Used-up sheets and notes on screen (code and unit tests only).
- Stripe's own portal wording.
- Native phone builds (all screenshots are the web build in iPhone and Android browsers).

## Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Owner | David Jones | | |
| Compliance reviewer | | | |
