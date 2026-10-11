import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKOUT_RETURN_COPY, PLUS_INTERVAL_ORDER, PLUS_PRICING, PLUS_UPGRADE_COPY } from '../config/pricing.ts';
import {
  isStripeHostedUrl,
  parseCheckoutReturn,
  PLAN_UNLOCK_POLL,
  stripCheckoutReturn,
} from '../lib/billing/checkoutReturn.ts';
import {
  formatPlusPrice,
  plusPriceLabel,
  plusRenewalDisclosure,
  plusSubscribeLabel,
} from '../lib/billing/pricing.ts';
import {
  checkoutReturnUrls,
  formatPrice,
  renewalDisclosure,
} from '../supabase/functions/_shared/billingText.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8');

// Prices the owner set on 2026-10-08.
assert.deepEqual(PLUS_PRICING, {
  month: { unitAmount: 699, currency: 'usd' },
  year: { unitAmount: 6000, currency: 'usd' },
});
assert.equal(formatPlusPrice('month'), '$6.99');
assert.equal(formatPlusPrice('year'), '$60');
assert.equal(plusPriceLabel('month'), '$6.99 a month');
assert.equal(plusPriceLabel('year'), '$60 a year');
// The button names the action and the price; never "Continue" or "Try Plus".
assert.equal(plusSubscribeLabel('month'), 'Subscribe for $6.99 a month');
assert.equal(plusSubscribeLabel('year'), 'Subscribe for $60 a year');
assert.deepEqual([...PLUS_INTERVAL_ORDER].sort(), ['month', 'year']);

// What the app shows above the button is word-for-word what Stripe's page will show.
for (const interval of ['month', 'year'] as const) {
  const { unitAmount, currency } = PLUS_PRICING[interval];
  assert.equal(formatPlusPrice(interval), formatPrice(unitAmount, currency));
  assert.equal(plusRenewalDisclosure(interval), renewalDisclosure(unitAmount, currency, interval));
  const text = plusRenewalDisclosure(interval);
  assert.match(text, /renews automatically/);
  assert.match(text, /until you cancel/);
  assert.match(text, /Cancel any time in Account, Manage subscription/);
  assert.doesNotMatch(text, /\bfree\b|trial|hurry|limited|only \d+ left|save \d|%/i, 'no pressure, "free" or savings wording');
}
// No dollar or percentage savings claims anywhere in the upgrade copy (compliance rule 4).
for (const value of [...Object.values(PLUS_UPGRADE_COPY), ...Object.values(CHECKOUT_RETURN_COPY)]) {
  assert.doesNotMatch(value, /save \$|\d+ ?% off|saves you/i, value);
}
assert.match(CHECKOUT_RETURN_COPY.cancelled, /not been charged/);

// Return URLs the server sends people back to are the ones this page understands.
const urls = checkoutReturnUrls('https://mealplanatic.app/');
assert.equal(parseCheckoutReturn(new URL(urls.success).search), 'success');
assert.equal(parseCheckoutReturn(new URL(urls.cancel).search), 'cancel');
assert.equal(parseCheckoutReturn(new URL(urls.portal).search), 'portal');
assert.equal(parseCheckoutReturn(''), null);
assert.equal(parseCheckoutReturn('?import=1'), null);
assert.equal(parseCheckoutReturn('?checkout=paid'), null);
assert.equal(stripCheckoutReturn('?checkout=success'), '');
assert.equal(stripCheckoutReturn('?import=1&checkout=cancel'), '?import=1');
assert.equal(stripCheckoutReturn('billing=return&x=1'), '?x=1');
assert.ok(PLAN_UNLOCK_POLL.intervalMs * PLAN_UNLOCK_POLL.attempts >= 15_000, 'wait long enough for the webhook');

// The browser is only ever sent to Stripe's own pages.
assert.equal(isStripeHostedUrl('https://checkout.stripe.com/c/pay/cs_test_123'), true);
assert.equal(isStripeHostedUrl('https://billing.stripe.com/p/session/abc'), true);
for (const bad of [
  'http://checkout.stripe.com/x',
  'https://checkout.stripe.com.evil.example/x',
  'https://evil.example/?u=https://checkout.stripe.com',
  'javascript:alert(1)',
  '',
]) {
  assert.equal(isStripeHostedUrl(bad), false, bad);
}

// Screen rules.
const options = read('components/billing/PlusUpgradeOptions.tsx');
const handler = read('components/billing/CheckoutReturnHandler.tsx');
const account = read('components/account/AccountPlanSection.tsx');
const card = read('components/PhotoScanPlusUpgradeCard.tsx');
const sheet = read('components/billing/PlusUpgradeSheet.tsx');
const client = read('lib/billing/client.ts');

// Renewal terms come before the buy button in the layout, and the terms link is there.
const disclosureAt = options.indexOf('plusRenewalDisclosure(interval)');
const buttonAt = options.indexOf('plusSubscribeLabel(interval)');
assert.ok(disclosureAt > 0 && buttonAt > disclosureAt, 'disclosure must sit above the buy button');
assert.match(options, /LEGAL_LINKS\.terms/);
// The disclosure is normal-size text, not fine print.
assert.match(options, /className="mt-3 text-sm leading-5 text-ink">\s*\{plusRenewalDisclosure/);
// Web only, and guests are asked to sign in rather than shown a dead button.
assert.match(options, /Platform\.OS === 'web'/);
assert.match(options, /openAuthSheet/);
// Tap targets at least 44px (design scheme): both plan rows, the buy button, sign-in, "Not now".
const tapHeights = [...options.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
assert.ok(tapHeights.length >= 4, 'every pressable sets a minimum height');
assert.ok(tapHeights.every((h) => h >= 44), `tap targets: ${tapHeights.join(', ')}`);
// Approved colours (design D-2): tomato only on the button that starts the purchase.
assert.match(options, /bg-tomato[^`]*`[\s\S]{0,200}plusSubscribeLabel\(interval\)/);
assert.equal((options.match(/bg-tomato/g) ?? []).length, 1);
assert.match(read('config/theme.colors.json'), /"tomato": "#D9301A"/);

// The full Plus screen: one benefit line, the options, and a close button that is always there.
assert.match(sheet, /PLUS_UPGRADE_COPY\.benefit/);
assert.match(sheet, /<PlusUpgradeOptions onNotNow=\{onClose\} \/>/);
assert.match(sheet, /accessibilityLabel=\{PLUS_UPGRADE_COPY\.close\}/);
assert.match(sheet, /onRequestClose=\{onClose\}/);
assert.match(sheet, /h-11 w-11/, 'close button is 44px');
assert.doesNotMatch(sheet + options, /works out to|per month when|\bsave\b|best value|most popular/i);
assert.match(card, /<PlusUpgradeSheet visible onClose=\{onDismiss\} \/>/);

// The page never switches Plus on itself; it only re-reads the plan the server set.
for (const source of [options, sheet, handler, account, card, client]) {
  assert.doesNotMatch(source, /plan_comp|admin_set_user_plan|recompute_user_plan|\.update\(\s*\{\s*plan/);
}
assert.match(handler, /refreshProfilePlan\(\)/);
assert.match(handler, /replaceState/, 'return marker is removed so a reload does not repeat it');

// Manage subscription is offered only to a live subscriber, and there is no extra step before it.
assert.match(account, /hasLiveSubscription \? \(/);
assert.match(account, /openBillingPortal\(\)/);
assert.doesNotMatch(account, /survey|are you sure|before you go|special offer/i);

// Price, customer and return address are never sent from the app.
assert.match(client, /postBillingFunction\('stripe-checkout', \{ interval \}\)/);
assert.match(client, /postBillingFunction\('stripe-portal', \{\}\)/);
assert.doesNotMatch(client, /price_|success_url|cancel_url|customer:/);

// The return handler is mounted once for the whole app.
assert.match(read('components/AppOverlays.tsx'), /<CheckoutReturnHandler \/>/);

console.log('plus-upgrade-ui-check: ok');
