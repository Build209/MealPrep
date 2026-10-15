import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeStripeSignature,
  constantTimeEqual,
  parseStripeSignatureHeader,
  verifyStripeSignature,
} from '../functions/stripe-webhook/signature.ts';
import {
  asUuid,
  consentRowFromCheckoutSession,
  isHandledEventType,
  isPlusActiveStatus,
  PLUS_ACTIVE_STATUSES,
  resolveLinkedUserId,
  shouldApplySubscriptionUpdate,
  stripeId,
  subscriptionIdFromInvoice,
  subscriptionRowFromStripe,
} from '../functions/stripe-webhook/subscriptionState.ts';

const supabaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'whsec_test_secret_for_unit_checks';
const USER = '3f2b8c1e-9d4a-4b6f-8a21-0c5d7e9f1a2b';

function sign(timestamp: number, body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

async function testSignature(): Promise<void> {
  const body = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
  const now = 1_800_000_000;
  const good = sign(now, body);

  // Matches Node's own HMAC, so the Web Crypto path is computing the right thing.
  assert.equal(await computeStripeSignature(SECRET, now, body), good);

  const ok = await verifyStripeSignature({
    secret: SECRET,
    header: `t=${now},v1=${good}`,
    rawBody: body,
    nowSeconds: now + 10,
  });
  assert.deepEqual(ok, { ok: true, timestamp: now });

  // Secret rotation: Stripe may send several v1 values; any valid one passes.
  const rotated = await verifyStripeSignature({
    secret: SECRET,
    header: `t=${now},v1=${'0'.repeat(64)},v1=${good},v0=ignored`,
    rawBody: body,
    nowSeconds: now,
  });
  assert.equal(rotated.ok, true);

  const cases: Array<[string, string | null, string, number, string]> = [
    ['missing header', null, body, now, 'missing_header'],
    ['no v1', `t=${now}`, body, now, 'malformed_header'],
    ['garbage', 'not-a-signature', body, now, 'malformed_header'],
    ['short hex', `t=${now},v1=abc123`, body, now, 'malformed_header'],
    ['wrong secret', `t=${now},v1=${sign(now, body, 'whsec_other')}`, body, now, 'mismatch'],
    ['tampered body', `t=${now},v1=${good}`, body.replace('evt_1', 'evt_2'), now, 'mismatch'],
    ['replayed timestamp', `t=${now + 1},v1=${good}`, body, now, 'mismatch'],
    ['too old', `t=${now},v1=${good}`, body, now + 301, 'stale'],
    ['from the future', `t=${now},v1=${good}`, body, now - 301, 'stale'],
  ];
  for (const [label, header, rawBody, nowSeconds, reason] of cases) {
    const result = await verifyStripeSignature({ secret: SECRET, header, rawBody, nowSeconds });
    assert.deepEqual(result, { ok: false, reason }, label);
  }

  const noSecret = await verifyStripeSignature({
    secret: '   ',
    header: `t=${now},v1=${good}`,
    rawBody: body,
    nowSeconds: now,
  });
  assert.deepEqual(noSecret, { ok: false, reason: 'no_secret' });

  assert.equal(constantTimeEqual('abcd', 'abcd'), true);
  assert.equal(constantTimeEqual('abcd', 'abce'), false);
  assert.equal(constantTimeEqual('abcd', 'abc'), false);
  assert.deepEqual(parseStripeSignatureHeader(` t=${now} , v1=${good.toUpperCase()} `), {
    timestamp: now,
    signatures: [good],
  });
}

function testSubscriptionMapping(): void {
  // Older API shape: period end on the subscription itself.
  const older = subscriptionRowFromStripe({
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: 1_800_000_000,
    metadata: { supabase_user_id: USER.toUpperCase() },
    items: { data: [{ price: { id: 'price_month', lookup_key: 'pro_monthly', recurring: { interval: 'month' } } }] },
  });
  assert.deepEqual(older, {
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    status: 'active',
    price_id: 'price_month',
    plan_tier: 'pro',
    billing_interval: 'month',
    current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
    cancel_at_period_end: false,
    metadata_user_id: USER,
  });

  // Newer API shape: period end on the item; customer expanded to an object.
  const newer = subscriptionRowFromStripe({
    id: 'sub_2',
    customer: { id: 'cus_2' },
    status: 'canceled',
    cancel_at_period_end: true,
    metadata: {},
    items: {
      data: [{ current_period_end: 1_800_100_000, price: { id: 'price_year', recurring: { interval: 'year' } } }],
    },
  });
  assert.equal(newer?.current_period_end, new Date(1_800_100_000 * 1000).toISOString());
  assert.equal(newer?.billing_interval, 'year');
  assert.equal(newer?.cancel_at_period_end, true);
  assert.equal(newer?.metadata_user_id, null);
  // A price with no lookup key we created (or none at all) names no tier: stored as null, treated as Plus.
  assert.equal(newer?.plan_tier, null);
  for (const [lookupKey, tier] of [
    ['plus_monthly', 'plus'],
    ['plus_yearly', 'plus'],
    ['pro_yearly', 'pro'],
    ['family_monthly', 'family'],
    ['family_yearly', 'family'],
    ['family', null],
    ['family_weekly', null],
    ['enterprise_monthly', null],
    ['', null],
    [42, null],
  ] as const) {
    const row = subscriptionRowFromStripe({
      id: 'sub_t',
      customer: 'cus_t',
      status: 'active',
      items: { data: [{ price: { id: 'price_t', lookup_key: lookupKey, recurring: { interval: 'month' } } }] },
    });
    assert.equal(row?.plan_tier, tier, String(lookupKey));
  }
  // A price whose key was moved to a newer price: the tier written at checkout still stands.
  const movedKey = (planTier: unknown) =>
    subscriptionRowFromStripe({
      id: 'sub_m',
      customer: 'cus_m',
      status: 'active',
      metadata: { plan_tier: planTier },
      items: { data: [{ price: { id: 'price_old', lookup_key: null, recurring: { interval: 'year' } } }] },
    })?.plan_tier;
  assert.equal(movedKey('family'), 'family');
  assert.equal(movedKey('pro'), 'pro');
  assert.equal(movedKey('platinum'), null, 'metadata is only believed when it names a real tier');
  assert.equal(movedKey(undefined), null);
  // The price's own key wins over metadata.
  assert.equal(
    subscriptionRowFromStripe({
      id: 'sub_k',
      customer: 'cus_k',
      status: 'active',
      metadata: { plan_tier: 'family' },
      items: { data: [{ price: { id: 'price_k', lookup_key: 'plus_monthly', recurring: { interval: 'month' } } }] },
    })?.plan_tier,
    'plus',
  );

  // A user id that is not a UUID is never trusted.
  const badUser = subscriptionRowFromStripe({
    id: 'sub_3',
    customer: 'cus_3',
    status: 'active',
    metadata: { supabase_user_id: "1' or '1'='1" },
  });
  assert.equal(badUser?.metadata_user_id, null);
  assert.equal(badUser?.price_id, null);

  for (const broken of [null, 'sub_1', {}, { id: 'sub_1' }, { id: 'sub_1', customer: 'cus_1' }]) {
    assert.equal(subscriptionRowFromStripe(broken), null);
  }

  assert.equal(stripeId('cus_1'), 'cus_1');
  assert.equal(stripeId({ id: 'cus_1' }), 'cus_1');
  assert.equal(stripeId(null), null);
  assert.equal(asUuid(USER), USER);
  assert.equal(asUuid('nope'), null);
}

function testStatusRules(): void {
  assert.deepEqual([...PLUS_ACTIVE_STATUSES], ['active', 'trialing', 'past_due']);
  for (const status of ['active', 'trialing', 'past_due']) assert.equal(isPlusActiveStatus(status), true);
  for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', '', null]) {
    assert.equal(isPlusActiveStatus(status), false, String(status));
  }

  // The SQL that derives the plan must use the same list. Was checked against the old migration in the old
  // app's stripe-webhook-mobile-check; since the switch-over, against the live schema baseline in db/.
  const baseline = fs.readFileSync(
    path.join(supabaseRoot, '..', 'db', 'supabase', 'migrations', '20261013000000_live_baseline.sql'),
    'utf8',
  );
  assert.match(baseline, /b\.status in \('active', 'trialing', 'past_due'\)/, 'recompute_user_plan uses the webhook status list');

  assert.equal(isHandledEventType('checkout.session.completed'), true);
  assert.equal(isHandledEventType('customer.subscription.deleted'), true);
  assert.equal(isHandledEventType('invoice.paid'), true);
  assert.equal(isHandledEventType('invoice.payment_failed'), true);
  assert.equal(isHandledEventType('charge.refunded'), false);

  // Invoice -> subscription id, in both API shapes; one-off invoices give null.
  assert.equal(subscriptionIdFromInvoice({ subscription: 'sub_1' }), 'sub_1');
  assert.equal(
    subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: { id: 'sub_2' } } } }),
    'sub_2',
  );
  assert.equal(subscriptionIdFromInvoice({ parent: { type: 'quote_details' } }), null);
  assert.equal(subscriptionIdFromInvoice(null), null);

  // Flexible billing mode signals "cancels at period end" with cancel_at, not the boolean.
  const flexibleCancel = subscriptionRowFromStripe({
    id: 'sub_f',
    customer: 'cus_f',
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: 1_800_200_000,
  });
  assert.equal(flexibleCancel?.cancel_at_period_end, true);
  const noCancel = subscriptionRowFromStripe({ id: 'sub_g', customer: 'cus_g', status: 'active', cancel_at: null });
  assert.equal(noCancel?.cancel_at_period_end, false);

  // First event for a customer, or any event for the stored subscription: apply.
  assert.equal(shouldApplySubscriptionUpdate(null, { stripe_subscription_id: 'sub_1', status: 'active' }), true);
  assert.equal(
    shouldApplySubscriptionUpdate(
      { stripe_subscription_id: 'sub_1', status: 'active' },
      { stripe_subscription_id: 'sub_1', status: 'canceled' },
    ),
    true,
  );
  // Late "ended" event for an old subscription must not switch off a live new one.
  assert.equal(
    shouldApplySubscriptionUpdate(
      { stripe_subscription_id: 'sub_new', status: 'active' },
      { stripe_subscription_id: 'sub_old', status: 'canceled' },
    ),
    false,
  );
  // Re-subscribing after a cancellation replaces the ended row.
  assert.equal(
    shouldApplySubscriptionUpdate(
      { stripe_subscription_id: 'sub_old', status: 'canceled' },
      { stripe_subscription_id: 'sub_new', status: 'active' },
    ),
    true,
  );
}

function testConsent(): void {
  const nowIso = '2026-10-09T00:00:00.000Z';
  const consent = consentRowFromCheckoutSession(
    {
      id: 'cs_1',
      mode: 'subscription',
      client_reference_id: USER,
      customer: 'cus_1',
      subscription: { id: 'sub_1' },
      amount_total: 499,
      currency: 'usd',
      created: 1_800_000_000,
      metadata: {
        price_id: 'price_month',
        billing_interval: 'month',
        terms_version: '2026-10-09',
        disclosure_version: 'v1',
      },
    },
    nowIso,
  );
  assert.deepEqual(consent, {
    user_id: USER,
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    stripe_checkout_session_id: 'cs_1',
    price_id: 'price_month',
    billing_interval: 'month',
    amount_cents: 499,
    currency: 'usd',
    terms_version: '2026-10-09',
    disclosure_version: 'v1',
    consented_at: new Date(1_800_000_000 * 1000).toISOString(),
  });

  // One-off payments are not subscription consent.
  assert.equal(consentRowFromCheckoutSession({ id: 'cs_2', mode: 'payment' }, nowIso), null);
  // Missing timestamp falls back to "now"; missing user stays null rather than guessed.
  const sparse = consentRowFromCheckoutSession({ id: 'cs_3', mode: 'subscription' }, nowIso);
  assert.equal(sparse?.consented_at, nowIso);
  assert.equal(sparse?.user_id, null);
}

/** T-4: an event for an account that has been deleted must not try to link to it. */
async function testDeletedAccountLink(): Promise<void> {
  const OTHER = '11111111-2222-4333-8444-555555555555';
  const lookups: string[] = [];
  const existsOnly = (...alive: string[]) => async (id: string) => {
    lookups.push(id);
    return alive.includes(id);
  };

  // Renewal after the account was deleted: the row was unlinked, metadata still names the user.
  assert.equal(await resolveLinkedUserId(null, [USER, null], existsOnly()), null);
  // Same event while the account exists links as before.
  assert.equal(await resolveLinkedUserId(null, [USER, null], existsOnly(USER)), USER);
  // The checkout hint is used when the metadata id is absent, and checked the same way.
  assert.equal(await resolveLinkedUserId(null, [null, USER], existsOnly(USER)), USER);
  assert.equal(await resolveLinkedUserId(undefined, [null, USER], existsOnly()), null);
  // A deleted metadata account does not block a live hint.
  assert.equal(await resolveLinkedUserId(null, [USER, OTHER], existsOnly(OTHER)), OTHER);

  // An already-linked row keeps its account and needs no lookup; metadata cannot re-point it.
  lookups.length = 0;
  assert.equal(await resolveLinkedUserId(OTHER, [USER], existsOnly(USER)), OTHER);
  assert.deepEqual(lookups, []);

  // A database error while checking must surface (the webhook then answers 500 and Stripe retries).
  await assert.rejects(
    resolveLinkedUserId(null, [USER], async () => {
      throw new Error('db down');
    }),
    /db down/,
  );
}

function testSourceRules(): void {
  const index = fs.readFileSync(
    path.join(supabaseRoot, 'functions/stripe-webhook/index.ts'),
    'utf8',
  );
  // Signature is verified on the raw body before the event is parsed.
  assert.ok(
    index.indexOf('verifyStripeSignature({') < index.indexOf('JSON.parse(rawBody)'),
    'signature must be checked before parsing',
  );
  // The webhook must never set the plan directly; only recompute_user_plan may.
  // It may read profiles (to see whether an account still exists) but never write them.
  assert.doesNotMatch(
    index,
    /from\('profiles'\)\s*\.(update|upsert|insert|delete)\(/,
    'webhook must not write profiles',
  );
  // T-4: both the subscription row and the consent row go through the deleted-account guard.
  assert.equal((index.match(/resolveLinkedUserId\(/g) ?? []).length, 2, 'subscription and consent both guarded');
  assert.doesNotMatch(index, /existingRow\?\.user_id \?\? row\.metadata_user_id/, 'unguarded user link is gone');
  assert.match(index, /rpc\('recompute_user_plan'/);
  // Only supabase-js may be imported remotely (bundler rule); no Stripe SDK.
  const remote = index.match(/from\s+['"]https?:\/\/[^'"]+['"]/g) ?? [];
  assert.ok(remote.every((stmt) => /esm\.sh\/@supabase\/supabase-js/.test(stmt)), remote.join(', '));
}

(async () => {
  await testSignature();
  testSubscriptionMapping();
  testStatusRules();
  testConsent();
  await testDeletedAccountLink();
  testSourceRules();
  console.log('stripe-webhook-check: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
