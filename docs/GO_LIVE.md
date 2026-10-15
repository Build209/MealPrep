# Taking real payments: go-live checklist

> **Moved from `mobile/docs/GO_LIVE.md` at the switch-over, not re-checked.** Partly stale:
> - **STALE:** the $6.99 and $60 prices named in step 2 are the old test-mode Plus prices. Do not use them; read
>   "MealPlanatic pricing tiers" / "MealPlanatic status" for the current numbers before going live.
> - **STALE:** "Account -> Plan", "Upgrade" and other screen names in step 5 are the old app's (`mobile/`, now deleted).
>   The new app's screens are `/plans` and `/account` (see `SWITCHOVER.md`, section 2).
> - Paths like `mobile/supabase/migrations/...` now live in `supabase/history/migrations/` (history only; `db/` is the source of truth).

Written Oct 9, 2026 by the manager session. Nothing here has been done yet. Work top to bottom;
do not skip a gate. Never paste a Stripe or Supabase key into chat, an issue or a pull request.

Until step 5, the app is in Stripe **test mode** and cannot charge a real card.

## 1. Gates (all must be true before anything below)

- [ ] Compliance has closed handoff 1 (subscription wording, consent record, cancel path, terms section).
- [ ] The terms and privacy pages on the live site name who operates MealPlanatic, the governing law, the price and monthly limits of every plan, renewal and cancellation, and that the app is for people 18 or older (PR #252).
- [ ] `stripe-webhook`, `stripe-checkout`, `stripe-portal` and `delete-user-account` on Supabase match `main` (deploy each from Actions -> Deploy Supabase function after the last billing PR merges).
- [ ] Testing has retested T-4, T-5 and T-6 and the checks still open in "What is still untested" in the testing doc: cancel in Manage subscription, declined card, deleting an account with a subscription.
- [ ] Monthly limits per plan are live for scans, recipe imports and Ask Forky questions (PR #252 and its migration), so an account cannot cost more than its plan allows.
- [ ] The cost of one video import has been measured from the function log and checked against Family's 25 a month.

## 2. Stripe dashboard, live mode (owner)

Switch the dashboard out of the sandbox first. Then:

- [ ] Three products, each with two recurring prices. The code finds prices by lookup key and reads the tier back from it, so the keys must match exactly, and each key must be on one active price only:

  | Product | Monthly | Lookup key | Yearly | Lookup key |
  |---|---|---|---|---|
  | MealPlanatic Plus | $4.99 | `plus_monthly` | $53.88 | `plus_yearly` |
  | MealPlanatic Pro | $8.99 | `pro_monthly` | $93.84 | `pro_yearly` |
  | MealPlanatic Family | $20.00 | `family_monthly` | $192.00 | `family_yearly` |

  In test mode the old $6.99 and $60 prices hold `plus_monthly` and `plus_yearly` today: move the keys to the new prices (Stripe: "transfer lookup key") and archive the old ones. A tier with no price cannot be bought; the app says "not available yet".
- [ ] Migration `20261011180000_plan_tiers.sql` applied BEFORE the functions from the same pull request are deployed (`stripe-webhook`, `stripe-checkout`, `pantry-vision`, `ask-forky`, `recipe-import`). They also run without it, treating every paid account as Plus and leaving imports uncounted.
- [ ] Customer portal: decide whether a subscriber may switch plan there. It is off today, so moving between Plus, Pro and Family means cancelling and buying again. If it is switched on, list the six prices and choose how the price difference is charged; the listener already reads the new tier from the new price.
- [ ] Secrets no longer read (safe to delete): `PANTRY_PLUS_MONTHLY_SCANS`, `PANTRY_PLUS_MONTHLY_TAG_SCANS`, `PANTRY_FREE_TOTAL_SCANS`, `FORKY_PLUS_MONTHLY_LIMIT`, `FORKY_FREE_TOTAL_LIMIT`. The one cost brake is `PLAN_LIMITS_OVERRIDE`, which can only lower a limit.
- [ ] Customer portal: cancellation allowed, cancel **at period end**, no survey or offer before the cancel button, card update and invoice history on, plan switching off. Set as default.
- [ ] Public business details: Terms of Service URL `https://mealplanatic.app/terms.html`, privacy URL, support email. The required consent box at checkout cannot show without the terms URL.
- [ ] Emails: successful-payment receipts on; **renewal reminder for yearly subscriptions on** (the terms promise it); failed-payment emails on.
- [ ] Payment methods: decide which stay on. The sandbox offered card, Link, Klarna, Cash App Pay and Amazon Pay; fees and dispute rules differ and the margin figures assume cards.
- [ ] Adaptive pricing: off, or the buy button's "$4.99" can disagree with a local-currency price abroad.
- [ ] Webhook endpoint `https://okkwapgyadpaifpmkcex.supabase.co/functions/v1/stripe-webhook` with exactly these six events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy its signing secret straight into Supabase (step 4).
- [ ] The earlier endpoint `we_1UOUIi...` that Stripe's API reports as live mode: delete it, or confirm it is the one just created. There must be exactly one live endpoint for this URL, or every event is handled twice.

## 3. Clear test data from the live database (manager prepares, owner approves)

Test-mode customers, subscriptions and consents are stored in the live tables. After the key
switch they would give test subscribers Plus for nothing and (for a non-live row) confuse
checkout. They hold test data only.

Read first, then delete, in one transaction, after the owner says go:

```sql
-- Look before deleting. Expect only test-mode rows (customer ids created during testing).
select user_id, stripe_customer_id, stripe_subscription_id, status from public.billing_subscriptions;
select count(*) from public.billing_consents;
select count(*) from public.stripe_events;

begin;
  -- Remember who had a linked row, to re-derive their plan afterwards.
  create temporary table _affected on commit drop as
    select distinct user_id from public.billing_subscriptions where user_id is not null;
  delete from public.stripe_events;
  delete from public.billing_consents;
  delete from public.billing_subscriptions;
  -- Plans come only from recompute_user_plan: comped accounts stay Plus, test buyers return to free.
  select public.recompute_user_plan(user_id) from _affected;
commit;

select plan, plan_comp, count(*) from public.profiles group by 1, 2;
```

- [ ] Counts noted before and after. No profile with `plan_comp = true` changed.
- [ ] Do this **after** the last test purchase and **before** step 4. Do not run it once real customers exist.

## 4. Switch the keys (owner, in Supabase -> Edge Functions -> Secrets)

- [ ] `STRIPE_SECRET_KEY`: the live secret key (a restricted key is better: Customers, Checkout Sessions, Subscriptions, Prices and Billing Portal, read and write).
- [ ] `STRIPE_WEBHOOK_SECRET`: the signing secret of the live endpoint from step 2. This also retires the test secret that was shown once in chat.
- [ ] `APP_WEB_URL` stays `https://mealplanatic.app/`.
- [ ] No redeploy is needed; functions read secrets on each request.

## 5. First real purchase (owner, then manager checks read-only)

Use a free, non-admin account and a real card.

- [ ] Account -> Plan shows both prices and the renewal wording; the Stripe page shows the same wording and an unticked box.
- [ ] Pay for **Plus monthly** ($4.99). The app shows MealPlanatic Plus within about 20 seconds without a reload, and Account shows its monthly limits.
- [ ] Manager confirms: one `billing_subscriptions` row linked to that account with status `active`; one `billing_consents` row with the price, terms version and disclosure version; the profile is `paid` with `plan_comp` false; the listener answered 200.
- [ ] A photo scan works on that account.
- [ ] Manage subscription -> cancel. Plus stays until the period end; the row shows cancel at period end.
- [ ] Refund the $4.99 in the Stripe dashboard.
- [ ] Press Upgrade twice quickly and from two tabs: one Checkout page only.

## 6. If something is wrong

- Put the two test-mode secrets back in Supabase. Checkout then makes test pages again and no real card can be charged.
- Refund any real charge in the Stripe dashboard. Stripe's fee on a refunded charge is not returned.
- Events Stripe could not deliver are retried for days; fix the listener and they will arrive.

## Known limits at go-live

- Sales tax is not collected (Stripe Tax is off). Ask an accountant whether software subscriptions are taxable in California and elsewhere.
- Deleting an account cancels Plus at once with no refund for the unused part of the period. The terms say so; compliance has not confirmed it.
- Receipts are not saved and prices are not read from them.
- The webhook does not yet alert if a customer somehow has two live subscriptions; the checkout guard is the only protection.
