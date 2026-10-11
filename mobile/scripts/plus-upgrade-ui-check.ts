import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAID_TIERS, TIER_NAMES, tierLimitsLine } from '../config/planTiers.ts';
import {
  CHECKOUT_RETURN_COPY,
  PLAN_TIER_ORDER,
  PLUS_INTERVAL_ORDER,
  PLUS_UPGRADE_COPY,
  TIER_PRICING,
} from '../config/pricing.ts';
import {
  isStripeHostedUrl,
  parseCheckoutReturn,
  PLAN_UNLOCK_POLL,
  stripCheckoutReturn,
} from '../lib/billing/checkoutReturn.ts';
import {
  formatTierPrice,
  tierPriceLabel,
  tierRenewalDisclosure,
  tierSubscribeLabel,
} from '../lib/billing/pricing.ts';
import {
  checkoutReturnUrls,
  formatPrice,
  renewalDisclosure,
} from '../supabase/functions/_shared/billingText.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8');

// Prices the owner set on 2026-10-11.
assert.deepEqual(TIER_PRICING, {
  plus: { month: { unitAmount: 499, currency: 'usd' }, year: { unitAmount: 5388, currency: 'usd' } },
  pro: { month: { unitAmount: 899, currency: 'usd' }, year: { unitAmount: 9384, currency: 'usd' } },
  family: { month: { unitAmount: 2000, currency: 'usd' }, year: { unitAmount: 19200, currency: 'usd' } },
});
// Yearly is twelve months less exactly 10%, 13% and 20% (to the cent), as the owner set it.
for (const [tier, percentOff] of [['plus', 10], ['pro', 13], ['family', 20]] as const) {
  const twelveMonths = TIER_PRICING[tier].month.unitAmount * 12;
  const expected = Math.round((twelveMonths * (100 - percentOff)) / 100);
  assert.ok(Math.abs(TIER_PRICING[tier].year.unitAmount - expected) <= 2, `${tier} yearly is ${percentOff}% off twelve months`);
  assert.equal(TIER_PRICING[tier].year.unitAmount % 12, 0, `${tier} yearly divides into whole cents a month`);
}
assert.equal(formatTierPrice('plus', 'month'), '$4.99');
assert.equal(formatTierPrice('plus', 'year'), '$53.88');
assert.equal(tierPriceLabel('pro', 'month'), '$8.99 a month');
assert.equal(tierPriceLabel('pro', 'year'), '$93.84 a year');
assert.equal(tierPriceLabel('family', 'month'), '$20 a month');
assert.equal(tierPriceLabel('family', 'year'), '$192 a year');
// The button names the action and the price; never "Continue" or "Try Plus".
assert.equal(tierSubscribeLabel('plus', 'month'), 'Subscribe for $4.99 a month');
assert.equal(tierSubscribeLabel('family', 'year'), 'Subscribe for $192 a year');
assert.deepEqual([...PLUS_INTERVAL_ORDER].sort(), ['month', 'year']);
assert.deepEqual([...PLAN_TIER_ORDER], [...PAID_TIERS], 'every paid tier can be chosen');
assert.equal(PLAN_TIER_ORDER[0], 'plus', 'the cheapest plan is the one selected to begin with');

// What the app shows above the button is word-for-word what Stripe's page will show.
for (const tier of PAID_TIERS) {
  for (const interval of ['month', 'year'] as const) {
    const { unitAmount, currency } = TIER_PRICING[tier][interval];
    assert.equal(formatTierPrice(tier, interval), formatPrice(unitAmount, currency));
    assert.equal(tierRenewalDisclosure(tier, interval), renewalDisclosure(unitAmount, currency, interval, tier));
    const text = tierRenewalDisclosure(tier, interval);
    assert.ok(text.startsWith(`${TIER_NAMES[tier]} is `), 'the plan being bought is named');
    assert.match(text, /renews automatically/);
    assert.match(text, /until you cancel/);
    assert.match(text, /Cancel any time in Account, Manage subscription/);
    assert.doesNotMatch(text, /\bfree\b|trial|hurry|limited|only \d+ left|save \d|%/i, 'no pressure, "free" or savings wording');
  }
  // The monthly limits are said in words beside the price.
  assert.match(tierLimitsLine(tier), /^\d+ scans, \d+ recipe imports and \d+ Ask Forky questions a month$/);
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
const disclosureAt = options.indexOf('tierRenewalDisclosure(tier, interval)');
const buttonAt = options.indexOf('tierSubscribeLabel(tier, interval)');
assert.ok(disclosureAt > 0 && buttonAt > disclosureAt, 'disclosure must sit above the buy button');
// The chosen plan's monthly limits are on screen, above the price and the button (compliance: a
// limit on a paid plan is stated where the decision is made, not only in the terms).
const limitsAt = options.indexOf('{TIER_NAMES[tier]}: {tierLimitsLine(tier)}.');
assert.ok(limitsAt > 0 && limitsAt < disclosureAt, 'limits of the chosen plan sit above the renewal terms');
assert.match(options, /className="mt-3 text-sm leading-5 text-ink">\s*\{TIER_NAMES\[tier\]\}: \{tierLimitsLine/, 'limits are normal-size text');
// Nothing but the first (cheapest) plan and the first period is chosen for the customer.
assert.match(options, /useState<PaidTier>\(PLAN_TIER_ORDER\[0\]\)/);
assert.match(options, /LEGAL_LINKS\.terms/);
// The disclosure is normal-size text, not fine print.
assert.match(options, /className="mt-3 text-sm leading-5 text-ink">\s*\{tierRenewalDisclosure/);
// Web only, and guests are asked to sign in rather than shown a dead button.
assert.match(options, /Platform\.OS === 'web'/);
assert.match(options, /openAuthSheet/);
// Tap targets at least 44px (design scheme): the plan chips, both period rows, the buy button, sign-in, "Not now".
const tapHeights = [...options.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
assert.ok(tapHeights.length >= 5, 'every pressable sets a minimum height');
assert.ok(tapHeights.every((h) => h >= 44), `tap targets: ${tapHeights.join(', ')}`);
// Approved colours (design D-2): tomato only on the button that starts the purchase.
assert.match(options, /bg-tomato[^`]*`[\s\S]{0,200}tierSubscribeLabel\(tier, interval\)/);
assert.equal((options.match(/bg-tomato/g) ?? []).length, 1);
assert.match(read('config/theme.colors.json'), /"tomato": "#D9301A"/);

// The full Plus screen: the benefit text, the options, and a close button that is always there.
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
assert.match(client, /postBillingFunction\('stripe-checkout', \{ interval, tier \}\)/);
assert.match(client, /postBillingFunction\('stripe-portal', \{\}\)/);
assert.doesNotMatch(client, /price_|success_url|cancel_url|customer:/);

// The return handler is mounted once for the whole app.
assert.match(read('components/AppOverlays.tsx'), /<CheckoutReturnHandler \/>/);

console.log('plus-upgrade-ui-check: ok');
