import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkoutReturnUrls,
  consentCheckboxText,
  DISCLOSURE_VERSION,
  encodeStripeForm,
  formatPrice,
  isLiveSubscriptionStatus,
  lookupKeyFor,
  normalizeAppUrl,
  parseBillingInterval,
  parseCheckoutTier,
  renewalDisclosure,
  TERMS_VERSION,
} from '../supabase/functions/_shared/billingText.ts';
import {
  hasLiveStripeSubscription,
  isUnknownStripeCustomer,
  planOpenCheckoutSessions,
} from '../supabase/functions/_shared/checkoutGuards.ts';
import { PLUS_ACTIVE_STATUSES } from '../supabase/functions/stripe-webhook/subscriptionState.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8');

// Prices print the way a customer expects.
assert.equal(formatPrice(699, 'usd'), '$6.99');
assert.equal(formatPrice(6000, 'usd'), '$60');
assert.equal(formatPrice(499, 'USD'), '$4.99');
assert.equal(formatPrice(550, 'cad'), '5.50 CAD');

// Renewal wording carries the three things the law asks for: price, period, how to cancel.
const monthly = renewalDisclosure(499, 'usd', 'month');
assert.equal(
  monthly,
  'MealPlanatic Plus is $4.99 a month. It renews automatically every month until you cancel. ' +
    'Cancel any time in Account, Manage subscription.',
);
const yearly = renewalDisclosure(5388, 'usd', 'year');
assert.match(yearly, /\$53\.88 a year/);
assert.match(yearly, /renews automatically every year until you cancel/);
assert.match(yearly, /Cancel any time in Account, Manage subscription/);
// Each tier is named in its own wording, so the customer agrees to the plan they are buying.
const proMonthly = renewalDisclosure(899, 'usd', 'month', 'pro');
assert.match(proMonthly, /^MealPlanatic Pro is \$8\.99 a month\./);
const familyYearly = renewalDisclosure(19200, 'usd', 'year', 'family');
assert.match(familyYearly, /^MealPlanatic Family is \$192 a year\. It renews automatically every year until you cancel\./);
for (const text of [monthly, yearly, proMonthly, familyYearly]) {
  assert.ok(text.length <= 1200, 'Stripe custom text limit');
  assert.doesNotMatch(text, /free|trial|hurry|only \d+ left|limited time/i, 'no pressure or "free" wording');
}

const box = consentCheckboxText(5388, 'usd', 'year', 'https://mealplanatic.app/terms.html');
assert.match(box, /^I agree that MealPlanatic Plus renews automatically at \$53\.88 every year until I cancel/);
assert.match(
  consentCheckboxText(899, 'usd', 'month', 'https://mealplanatic.app/terms.html', 'pro'),
  /^I agree that MealPlanatic Pro renews automatically at \$8\.99 every month until I cancel/,
);
assert.match(box, /\[Terms of Use\]\(https:\/\/mealplanatic\.app\/terms\.html\)/);

assert.equal(parseBillingInterval('month'), 'month');
assert.equal(parseBillingInterval('year'), 'year');
for (const bad of ['week', 'MONTH', '', null, undefined, 12, { interval: 'month' }]) {
  assert.equal(parseBillingInterval(bad), null);
}
// One Stripe price per tier and period, found by lookup key. Plus keeps the keys it always had.
assert.equal(lookupKeyFor('plus', 'month'), 'plus_monthly');
assert.equal(lookupKeyFor('plus', 'year'), 'plus_yearly');
assert.equal(lookupKeyFor('pro', 'month'), 'pro_monthly');
assert.equal(lookupKeyFor('family', 'year'), 'family_yearly');
// A request with no tier is Plus (app versions from before tiers); a wrong tier is refused, never guessed.
assert.equal(parseCheckoutTier(undefined), 'plus');
assert.equal(parseCheckoutTier(null), 'plus');
assert.equal(parseCheckoutTier('pro'), 'pro');
assert.equal(parseCheckoutTier('family'), 'family');
for (const bad of ['free', 'PRO', '', 'gold', 2, {}, ['pro']]) {
  assert.equal(parseCheckoutTier(bad), null, String(bad));
}
assert.match(DISCLOSURE_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);

// Return URLs: https only, fixed shape, no route needed on GitHub Pages.
assert.equal(normalizeAppUrl('https://mealplanatic.app'), 'https://mealplanatic.app/');
assert.equal(normalizeAppUrl(' https://mealplanatic.app/?x=1#y '), 'https://mealplanatic.app/');
assert.equal(normalizeAppUrl('http://localhost:8081'), 'http://localhost:8081/');
for (const bad of ['http://mealplanatic.app', 'javascript:alert(1)', 'mealplanatic.app', '', null, undefined]) {
  assert.equal(normalizeAppUrl(bad), null, String(bad));
}
assert.deepEqual(checkoutReturnUrls('https://mealplanatic.app/'), {
  success: 'https://mealplanatic.app/?checkout=success',
  cancel: 'https://mealplanatic.app/?checkout=cancel',
  portal: 'https://mealplanatic.app/?billing=return',
  terms: 'https://mealplanatic.app/terms.html',
});

// Stripe form encoding: nested objects and arrays use bracket keys; empty values are dropped.
const encoded = new URLSearchParams(
  encodeStripeForm({
    mode: 'subscription',
    line_items: [{ price: 'price_1', quantity: 1 }],
    consent_collection: { terms_of_service: 'required' },
    metadata: { supabase_user_id: 'u1', note: 'a&b=c' },
    lookup_keys: ['plus_monthly'],
    active: true,
    configuration: null,
    skipped: undefined,
  }),
);
assert.equal(encoded.get('mode'), 'subscription');
assert.equal(encoded.get('line_items[0][price]'), 'price_1');
assert.equal(encoded.get('line_items[0][quantity]'), '1');
assert.equal(encoded.get('consent_collection[terms_of_service]'), 'required');
assert.equal(encoded.get('metadata[note]'), 'a&b=c');
assert.equal(encoded.get('lookup_keys[0]'), 'plus_monthly');
assert.equal(encoded.get('active'), 'true');
assert.equal(encoded.has('configuration'), false);
assert.equal(encoded.has('skipped'), false);

// "Already subscribed" uses the same status list as the webhook and the SQL.
for (const status of PLUS_ACTIVE_STATUSES) assert.equal(isLiveSubscriptionStatus(status), true);
for (const status of ['canceled', 'unpaid', 'incomplete', null, undefined]) {
  assert.equal(isLiveSubscriptionStatus(status), false);
}

// --- T-5: never two subscriptions for one customer ---
assert.equal(hasLiveStripeSubscription([]), false);
assert.equal(hasLiveStripeSubscription([{ status: 'canceled' }, { status: 'incomplete_expired' }, { status: 'incomplete' }]), false);
for (const status of PLUS_ACTIVE_STATUSES) {
  assert.equal(hasLiveStripeSubscription([{ status: 'canceled' }, { status }]), true, `${status} blocks a second checkout`);
}
assert.equal(hasLiveStripeSubscription([{ status: null }, {}]), false);

const openYearly = { id: 'cs_year', url: 'https://checkout.stripe.com/c/pay/cs_year', metadata: { price_id: 'price_year' } };
const openMonthly = { id: 'cs_month', url: 'https://checkout.stripe.com/c/pay/cs_month', metadata: { price_id: 'price_month' } };
// Nothing open: make a new page.
assert.deepEqual(planOpenCheckoutSessions([], { priceId: 'price_year' }), { reuseUrl: null, expireIds: [] });
// Same plan already open (the "two tabs, minutes apart" case): hand the same page back, close nothing.
assert.deepEqual(planOpenCheckoutSessions([openYearly], { priceId: 'price_year' }), { reuseUrl: openYearly.url, expireIds: [] });
// The other plan is open: close it, then make the new page, so only one page can be paid.
assert.deepEqual(planOpenCheckoutSessions([openMonthly], { priceId: 'price_year' }), { reuseUrl: null, expireIds: ['cs_month'] });
// Both open: reuse the matching one and close the other.
assert.deepEqual(planOpenCheckoutSessions([openMonthly, openYearly], { priceId: 'price_year' }), {
  reuseUrl: openYearly.url,
  expireIds: ['cs_month'],
});
// Two pages for the same plan: keep one, close the spare.
assert.deepEqual(
  planOpenCheckoutSessions([openYearly, { ...openYearly, id: 'cs_year_2' }], { priceId: 'price_year' }),
  { reuseUrl: openYearly.url, expireIds: ['cs_year_2'] },
);
// A matching page with no link cannot be reused: close it.
assert.deepEqual(planOpenCheckoutSessions([{ id: 'cs_nolink', url: null, metadata: { price_id: 'price_year' } }], { priceId: 'price_year' }), {
  reuseUrl: null,
  expireIds: ['cs_nolink'],
});
assert.deepEqual(planOpenCheckoutSessions([{ id: 'cs_nometa', url: 'https://x.test' }], { priceId: 'price_year' }), {
  reuseUrl: null,
  expireIds: ['cs_nometa'],
});

// --- T-6: a customer id Stripe does not know ---
assert.equal(isUnknownStripeCustomer({ status: 400, stripeCode: 'resource_missing' }), true);
assert.equal(isUnknownStripeCustomer({ status: 404, stripeCode: null }), true);
assert.equal(isUnknownStripeCustomer({ status: 500, stripeCode: null }), false);
assert.equal(isUnknownStripeCustomer({ status: 400, stripeCode: 'parameter_invalid' }), false);
assert.equal(isUnknownStripeCustomer(new Error('network')), false);
assert.equal(isUnknownStripeCustomer(null), false);

// Source rules for the two functions that start payments.
const checkout = read('supabase/functions/stripe-checkout/index.ts');
const portal = read('supabase/functions/stripe-portal/index.ts');
const server = read('supabase/functions/_shared/billingServer.ts');

// Sign-in is verified with Supabase Auth, never by decoding the token.
assert.match(server, /auth\.getUser\(\)/);
for (const source of [checkout, portal, server]) {
  assert.doesNotMatch(source, /atob\(|split\('\.'\)/, 'never decode the sign-in token by hand');
}
// Price ids, customer ids and return URLs never come from the request body.
assert.doesNotMatch(checkout, /body\.(price|priceId|price_id|success_url|cancel_url|customer)/);
assert.doesNotMatch(portal, /req\.json\(\)/, 'portal takes nothing from the request body');
assert.match(checkout, /const lookupKey = lookupKeyFor\(tier, interval\);/);
assert.match(checkout, /lookup_keys: \[lookupKey\]/);
assert.match(checkout, /plan_tier: tier,/, 'the tier bought is kept with the consent metadata');
// The consent box is required and the disclosure sits by the pay button.
assert.match(checkout, /consent_collection: \{ terms_of_service: 'required' \}/);
assert.match(checkout, /submit: \{ message: renewalDisclosure\(/);
assert.match(checkout, /disclosure_version: DISCLOSURE_VERSION/);
assert.match(checkout, /terms_version: TERMS_VERSION/);
// A second purchase is refused, and the user id travels to the webhook two ways.
assert.match(checkout, /ALREADY_SUBSCRIBED/);
assert.match(checkout, /client_reference_id: userId/);
assert.match(checkout, /subscription_data: \{[\s\S]*supabase_user_id: userId/);
// T-5 wiring: Stripe is asked about subscriptions and open pages before a new page is created,
// and a matching open page is returned instead of creating another.
const createAt = checkout.indexOf("'POST', '/checkout/sessions', {");
assert.ok(createAt > 0);
for (const marker of [
  "'/subscriptions',",
  'hasLiveStripeSubscription(subscriptions.data',
  "form: { customer: customerId, status: 'open', limit: 20 }",
  'planOpenCheckoutSessions(openSessions, { priceId: price.id })',
  'if (openPlan.reuseUrl) {',
]) {
  const at = checkout.indexOf(marker);
  assert.ok(at > 0 && at < createAt, `before creating a session: ${marker}`);
}
assert.match(checkout, /\/checkout\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/expire/);
// The price id that reuse depends on is written into every session's metadata.
assert.match(checkout, /metadata: \{\s*supabase_user_id: userId,\s*price_id: price\.id,/);
// T-6 wiring: only an unknown-customer answer starts over; other Stripe errors still fail the request.
assert.match(checkout, /if \(!isUnknownStripeCustomer\(lookupError\)\) throw lookupError;/);
// The stale row is unlinked, never deleted (billing records are kept).
assert.doesNotMatch(checkout, /from\('billing_subscriptions'\)\s*\.delete\(/);
assert.match(checkout, /\.update\(\{ user_id: null, updated_at: [^}]+\}\)\s*\.eq\('user_id', userId\)\s*\.eq\('stripe_customer_id', staleCustomerId\)/);

// Neither function may change the plan; only the webhook's recompute does.
for (const source of [checkout, portal]) {
  assert.doesNotMatch(source, /from\('profiles'\)|recompute_user_plan|plan_comp/);
}
// Only supabase-js is imported remotely (bundler rule); no Stripe SDK.
for (const source of [checkout, portal, server]) {
  const remote = source.match(/from\s+['"]https?:\/\/[^'"]+['"]/g) ?? [];
  assert.ok(remote.every((stmt) => /esm\.sh\/@supabase\/supabase-js/.test(stmt)), remote.join(', '));
}

// The terms version we record must be the date printed on the live terms page.
const termsHtml = read('public/terms.html');
const [year, month, day] = TERMS_VERSION.split('-').map(Number);
const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
assert.ok(
  termsHtml.includes(`${monthName} ${day}, ${year}`),
  `terms.html should be dated ${monthName} ${day}, ${year} to match TERMS_VERSION`,
);

console.log('stripe-checkout-check: ok');
