/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS_COPY, SUBSCRIPTION_STATUS_COPY, includesLine } from '../src/plans/copy';
import {
  billingErrorMessage,
  checkoutBody,
  checkoutLookupKey,
  formatTierPrice,
  INTERVAL_ORDER,
  isLiveSubscription,
  isStripeHostedUrl,
  PLAN_TIER_ORDER,
  planScreenState,
  subscriptionStatusLine,
  tierLimitsLine,
  tierLimitsSentence,
  tierPriceLabel,
  tierRenewalDisclosure,
  tierRowLabel,
  tierSubscribeLabel,
  type OwnSubscription,
} from '../src/plans/pricing';
import { PAID_TIERS } from '../src/scan/planTiers';

test('prices: the six published prices (owner decision 2026-10-11, compliance update)', () => {
  assert.equal(formatTierPrice('plus', 'month'), '$4.99');
  assert.equal(formatTierPrice('plus', 'year'), '$53.88');
  assert.equal(formatTierPrice('pro', 'month'), '$8.99');
  assert.equal(formatTierPrice('pro', 'year'), '$93.84');
  assert.equal(formatTierPrice('family', 'month'), '$20');
  assert.equal(formatTierPrice('family', 'year'), '$192');
  assert.equal(tierPriceLabel('plus', 'month'), '$4.99 a month');
  assert.equal(tierPriceLabel('family', 'year'), '$192 a year');
});

test('the buy button states the price', () => {
  assert.equal(tierSubscribeLabel('plus', 'month'), 'Subscribe for $4.99 a month');
  assert.equal(tierSubscribeLabel('plus', 'year'), 'Subscribe for $53.88 a year');
  assert.equal(tierSubscribeLabel('pro', 'year'), 'Subscribe for $93.84 a year');
  assert.equal(tierSubscribeLabel('family', 'month'), 'Subscribe for $20 a month');
});

test('renewal terms: price, renewal period and how to cancel, word for word the live disclosure', () => {
  assert.equal(
    tierRenewalDisclosure('plus', 'month'),
    'MealPlanatic Plus is $4.99 a month. It renews automatically every month until you cancel. Cancel any time in Account, Manage subscription.',
  );
  assert.equal(
    tierRenewalDisclosure('plus', 'year'),
    'MealPlanatic Plus is $53.88 a year. It renews automatically every year until you cancel. Cancel any time in Account, Manage subscription.',
  );
  assert.equal(
    tierRenewalDisclosure('pro', 'year'),
    'MealPlanatic Pro is $93.84 a year. It renews automatically every year until you cancel. Cancel any time in Account, Manage subscription.',
  );
  assert.equal(
    tierRenewalDisclosure('family', 'month'),
    'MealPlanatic Family is $20 a month. It renews automatically every month until you cancel. Cancel any time in Account, Manage subscription.',
  );
});

test('limits shown beside each price come from planTiers.ts', () => {
  assert.equal(tierLimitsLine('free'), '3 scans, 2 recipe imports and 5 Ask Forky questions a month');
  assert.equal(tierLimitsLine('plus'), '15 scans, 5 recipe imports and 15 Ask Forky questions a month');
  assert.equal(tierLimitsLine('pro'), '25 scans, 10 recipe imports and 30 Ask Forky questions a month');
  assert.equal(tierLimitsLine('family'), '50 scans, 25 recipe imports and 60 Ask Forky questions a month');
  assert.equal(tierLimitsSentence('free'), 'Free: 3 scans, 2 recipe imports and 5 Ask Forky questions a month.');
  assert.equal(tierLimitsSentence('pro'), 'MealPlanatic Pro: 25 scans, 10 recipe imports and 30 Ask Forky questions a month.');
  assert.equal(tierRowLabel('plus', 'year'), 'MealPlanatic Plus, $53.88 a year: 15 scans, 5 recipe imports and 15 Ask Forky questions a month');
  assert.equal(includesLine(tierLimitsLine('plus')), 'Includes 15 scans, 5 recipe imports and 15 Ask Forky questions a month.');
});

test('order: Plus, Pro, Family; yearly first (as in the live app)', () => {
  assert.deepEqual([...PLAN_TIER_ORDER], ['plus', 'pro', 'family']);
  assert.deepEqual([...INTERVAL_ORDER], ['year', 'month']);
});

test('checkout is sent the tier and period only; the server picks the price by lookup key', () => {
  assert.deepEqual(checkoutBody('plus', 'year'), { interval: 'year', tier: 'plus' });
  assert.deepEqual(checkoutBody('family', 'month'), { interval: 'month', tier: 'family' });
  assert.equal(checkoutLookupKey('plus', 'year'), 'plus_yearly');
  assert.equal(checkoutLookupKey('pro', 'month'), 'pro_monthly');
  assert.equal(checkoutLookupKey('family', 'year'), 'family_yearly');
});

test('only Stripe-hosted pages are opened', () => {
  assert.equal(isStripeHostedUrl('https://checkout.stripe.com/c/pay/cs_test_1'), true);
  assert.equal(isStripeHostedUrl('https://billing.stripe.com/p/session/x'), true);
  assert.equal(isStripeHostedUrl('http://checkout.stripe.com/c/pay'), false);
  assert.equal(isStripeHostedUrl('https://checkout.stripe.com.evil.example/'), false);
  assert.equal(isStripeHostedUrl('javascript:alert(1)'), false);
  assert.equal(isStripeHostedUrl('not a url'), false);
});

test('failure messages are our own words', () => {
  assert.equal(billingErrorMessage('stripe-checkout', 'ALREADY_SUBSCRIBED'), PLANS_COPY.alreadySubscribed);
  assert.equal(billingErrorMessage('stripe-checkout', 'PRICE_NOT_FOUND'), PLANS_COPY.notConfigured);
  assert.equal(billingErrorMessage('stripe-checkout', 'NOT_CONFIGURED'), PLANS_COPY.notConfigured);
  assert.equal(billingErrorMessage('stripe-portal', 'UNAUTHENTICATED'), PLANS_COPY.signInHint);
  assert.equal(billingErrorMessage('stripe-checkout', undefined), PLANS_COPY.genericError);
  assert.equal(billingErrorMessage('stripe-portal', 'X'), PLANS_COPY.manageError);
});

const sub = (over: Partial<OwnSubscription>): OwnSubscription => ({
  status: 'active',
  billingInterval: 'month',
  currentPeriodEnd: '2026-11-14T12:00:00Z',
  cancelAtPeriodEnd: false,
  planTier: 'plus',
  ...over,
});

test('subscription status line and live statuses', () => {
  assert.equal(isLiveSubscription(sub({ status: 'active' })), true);
  assert.equal(isLiveSubscription(sub({ status: 'trialing' })), true);
  assert.equal(isLiveSubscription(sub({ status: 'past_due' })), true);
  assert.equal(isLiveSubscription(sub({ status: 'canceled' })), false);
  assert.equal(isLiveSubscription(null), false);
  assert.equal(subscriptionStatusLine(sub({ status: 'past_due' })), SUBSCRIPTION_STATUS_COPY.pastDue);
  assert.match(subscriptionStatusLine(sub({}), 'en-US') ?? '', /^Renews on November 1[45], 2026\.$/);
  assert.match(subscriptionStatusLine(sub({ cancelAtPeriodEnd: true }), 'en-US') ?? '', /^Your plan ends on November 1[45], 2026\. You will not be charged again\.$/);
  assert.equal(subscriptionStatusLine(sub({ currentPeriodEnd: null })), null);
});

test('who can buy: free with no live subscription, on the web; manage only with a live subscription', () => {
  assert.deepEqual(planScreenState({ plan: 'free', subscription: null, canBuyHere: true }), {
    isPaid: false,
    showBuy: true,
    showManage: false,
    showComped: false,
  });
  assert.equal(planScreenState({ plan: 'free', subscription: null, canBuyHere: false }).showBuy, false, 'phones: not sold');
  assert.equal(planScreenState({ plan: 'free', subscription: sub({}), canBuyHere: true }).showBuy, false, 'never a second subscription');
  assert.deepEqual(planScreenState({ plan: 'paid', subscription: sub({}), canBuyHere: true }), {
    isPaid: true,
    showBuy: false,
    showManage: true,
    showComped: false,
  });
  assert.equal(planScreenState({ plan: 'paid', subscription: null, canBuyHere: true }).showComped, true, 'comp: nothing to pay');
  assert.equal(planScreenState({ plan: 'paid', subscription: sub({ status: 'canceled' }), canBuyHere: true }).showManage, false);
});

test('compliance rule 11: no pressure or savings wording, "free" only about the free plan', () => {
  const money = [
    ...PAID_TIERS.flatMap((t) => INTERVAL_ORDER.flatMap((i) => [tierRenewalDisclosure(t, i), tierSubscribeLabel(t, i), tierRowLabel(t, i)])),
    PLANS_COPY.benefit,
    PLANS_COPY.title,
  ].join(' ');
  assert.doesNotMatch(money, /\bfree\b|\bsave\b|saving|%|today only|hurry|don't miss|limited|last chance|ends soon|trial/i);
});

// The LIVE lines are copied from the old app, which compliance saw with the tier build (#252).
// Snapshot of the old app's files (mobile/ is deleted): tests/fixtures/old-app/README.md.
const oldApp = join(__dirname, 'fixtures', 'old-app');
const functions = join(__dirname, '..', '..', 'supabase', 'functions');

/** Old-app file, read from the snapshot (`config/pricing.ts` -> `config_pricing.ts.txt`). Missing is a failure, never a skip. */
function readOldApp(rel: string): string {
  const file = join(oldApp, `${rel.replace(/\//g, '_')}.txt`);
  assert.ok(existsSync(file), `old-app snapshot of ${rel} is missing (tests/fixtures/old-app)`);
  return readFileSync(file, 'utf8');
}

test('LIVE wording is still word for word in the old app (snapshot)', () => {
  const src = [
    'config/pricing.ts',
    'config/account.ts',
    'components/account/AccountPlanSection.tsx',
    'lib/billing/pricing.ts',
  ]
    .map((f) => readOldApp(f))
    .join('\n');
  const live = [
    PLANS_COPY.benefit,
    PLANS_COPY.tierChoiceLabel,
    PLANS_COPY.intervalChoiceLabel,
    PLANS_COPY.payYearly,
    PLANS_COPY.payMonthly,
    PLANS_COPY.termsLinkLabel,
    PLANS_COPY.starting,
    PLANS_COPY.manage,
    PLANS_COPY.managing,
    PLANS_COPY.manageHint,
    PLANS_COPY.genericError,
    PLANS_COPY.manageError,
    PLANS_COPY.alreadySubscribed,
    PLANS_COPY.notConfigured,
    PLANS_COPY.signInHint,
    PLANS_COPY.compedBlurb,
    PLANS_COPY.freeBlurb,
    PLANS_COPY.freeBlurbNativeNoBilling,
    PLANS_COPY.paidBlurb,
    SUBSCRIPTION_STATUS_COPY.pastDue,
    'Your plan ends on ${date}. You will not be charged again.',
    'Renews on ${date}.',
    'It renews automatically ${period.every} until you cancel. ',
    'Cancel any time in Account, Manage subscription.',
    'Subscribe for ${tierPriceLabel(tier, interval)}',
  ];
  for (const line of live) assert.ok(src.includes(line), `not found in the old app: ${line}`);
});

test('renewal terms match the server wording the consent record names', () => {
  const server = readFileSync(join(functions, '_shared', 'billingText.ts'), 'utf8');
  assert.match(server, /DISCLOSURE_VERSION = '2026-10-11\.1'/, 'disclosure version changed: re-check this screen with compliance');
  assert.ok(server.includes("`${TIER_NAMES[tier]} is ${price} ${period.a}. It renews automatically ${period.every} until you cancel. ` +"));
  assert.ok(server.includes("'Cancel any time in Account, Manage subscription.'"));
  const prices = readOldApp('config/pricing.ts');
  for (const [tier, m, y] of [
    ['plus', 499, 5388],
    ['pro', 899, 9384],
    ['family', 2000, 19200],
  ] as const) {
    assert.match(prices, new RegExp(`${tier}: \\{ month: \\{ unitAmount: ${m}, currency: 'usd' \\}, year: \\{ unitAmount: ${y}, currency: 'usd' \\} \\}`), tier);
  }
});
