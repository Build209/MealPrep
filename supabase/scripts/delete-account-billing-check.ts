/**
 * Paywall step 5: deleting an account stops Stripe billing first.
 * Run from supabase/: npm run test:billing
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isStripeMissingError,
  stopBillingForCustomers,
  type StripeCall,
  type StripeForm,
  type StripeMethod,
} from '../functions/_shared/stopBilling.ts';

const supabaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class FakeStripeError extends Error {
  status: number;
  stripeCode: string | null;
  constructor(status: number, stripeCode: string | null = null) {
    super(`fake stripe ${status}`);
    this.status = status;
    this.stripeCode = stripeCode;
  }
}

type Call = { method: StripeMethod; path: string; form?: StripeForm };

/** A tiny stand-in for Stripe: subscriptions and open checkout sessions per customer. */
function fakeStripe(state: {
  subscriptions?: Record<string, Array<{ id: string; status: string }>>;
  openSessions?: Record<string, string[]>;
  /** Throw this for any call whose "METHOD path" starts with the key. */
  fail?: Record<string, Error>;
  /** Paying on this open session creates this subscription (race with deletion). */
  payOnExpire?: Record<string, { id: string; status: string }>;
}): { call: StripeCall; calls: Call[] } {
  const subscriptions = state.subscriptions ?? {};
  const openSessions = state.openSessions ?? {};
  const calls: Call[] = [];

  const call = (async (method: StripeMethod, path: string, form?: StripeForm) => {
    calls.push({ method, path, form });
    for (const [prefix, error] of Object.entries(state.fail ?? {})) {
      if (`${method} ${path}`.startsWith(prefix)) throw error;
    }
    const customer = String(form?.customer ?? '');
    const known = customer in subscriptions || customer in openSessions;

    if (method === 'GET' && path === '/checkout/sessions') {
      if (!known) throw new FakeStripeError(400, 'resource_missing');
      assert.equal(form?.status, 'open');
      return { data: (openSessions[customer] ?? []).map((id) => ({ id })), has_more: false };
    }
    if (method === 'POST' && path.endsWith('/expire')) {
      const sessionId = path.split('/')[3];
      const paid = state.payOnExpire?.[sessionId];
      if (paid) {
        // The customer paid a moment before: Stripe refuses to expire a completed session.
        for (const list of Object.values(subscriptions)) list.push(paid);
        throw new FakeStripeError(400, 'checkout_session_not_open');
      }
      return { id: sessionId, status: 'expired' };
    }
    if (method === 'GET' && path === '/subscriptions') {
      assert.equal(form?.status, 'all', 'must list every status, not only active');
      return { data: subscriptions[customer] ?? [], has_more: false };
    }
    if (method === 'DELETE' && path.startsWith('/subscriptions/')) {
      const id = path.split('/')[2];
      for (const list of Object.values(subscriptions)) {
        const found = list.find((s) => s.id === id);
        if (found) {
          found.status = 'canceled';
          return found;
        }
      }
      throw new FakeStripeError(404, 'resource_missing');
    }
    throw new Error(`unexpected Stripe call ${method} ${path}`);
  }) as StripeCall;

  return { call, calls };
}

(async () => {
  // 1. One live subscription: cancelled immediately.
  {
    const { call, calls } = fakeStripe({ subscriptions: { cus_a: [{ id: 'sub_1', status: 'active' }] } });
    const result = await stopBillingForCustomers(['cus_a'], call);
    assert.deepEqual(result.canceledSubscriptions, ['sub_1']);
    assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/subscriptions/sub_1'));
  }

  // 2. Every status that can still charge is cancelled; ended ones are left alone.
  {
    const { call } = fakeStripe({
      subscriptions: {
        cus_a: [
          { id: 'sub_active', status: 'active' },
          { id: 'sub_trial', status: 'trialing' },
          { id: 'sub_late', status: 'past_due' },
          { id: 'sub_unpaid', status: 'unpaid' },
          { id: 'sub_paused', status: 'paused' },
          { id: 'sub_incomplete', status: 'incomplete' },
          { id: 'sub_done', status: 'canceled' },
          { id: 'sub_expired', status: 'incomplete_expired' },
        ],
      },
    });
    const result = await stopBillingForCustomers(['cus_a'], call);
    assert.deepEqual(result.canceledSubscriptions.sort(), [
      'sub_active',
      'sub_incomplete',
      'sub_late',
      'sub_paused',
      'sub_trial',
      'sub_unpaid',
    ]);
  }

  // 3. Testing's T-5 case: two live subscriptions on one customer are both cancelled.
  {
    const { call } = fakeStripe({
      subscriptions: { cus_a: [{ id: 'sub_1', status: 'active' }, { id: 'sub_2', status: 'active' }] },
    });
    const result = await stopBillingForCustomers(['cus_a'], call);
    assert.deepEqual(result.canceledSubscriptions, ['sub_1', 'sub_2']);
  }

  // 4. An open Checkout page is closed before subscriptions are listed.
  {
    const { call, calls } = fakeStripe({ subscriptions: { cus_a: [] }, openSessions: { cus_a: ['cs_open'] } });
    const result = await stopBillingForCustomers(['cus_a'], call);
    assert.deepEqual(result.expiredCheckoutSessions, ['cs_open']);
    const expireAt = calls.findIndex((c) => c.path === '/checkout/sessions/cs_open/expire');
    const listAt = calls.findIndex((c) => c.method === 'GET' && c.path === '/subscriptions');
    assert.ok(expireAt >= 0 && expireAt < listAt, 'expire sessions before listing subscriptions');
  }

  // 5. The page was paid a moment before deletion: the new subscription is still cancelled.
  {
    const { call } = fakeStripe({
      subscriptions: { cus_a: [] },
      openSessions: { cus_a: ['cs_race'] },
      payOnExpire: { cs_race: { id: 'sub_new', status: 'active' } },
    });
    const result = await stopBillingForCustomers(['cus_a'], call);
    assert.deepEqual(result.expiredCheckoutSessions, []);
    assert.deepEqual(result.canceledSubscriptions, ['sub_new']);
  }

  // 6. Testing's T-6 case: Stripe does not know the customer under this key. Nothing to cancel,
  //    and deletion must not be blocked forever.
  {
    const { call, calls } = fakeStripe({});
    const result = await stopBillingForCustomers(['cus_from_test_mode'], call);
    assert.deepEqual(result.missingCustomers, ['cus_from_test_mode']);
    assert.deepEqual(result.canceledSubscriptions, []);
    assert.ok(!calls.some((c) => c.method === 'DELETE'));
  }

  // 7. Stripe is down: the error surfaces so the account is NOT deleted.
  {
    const { call } = fakeStripe({
      subscriptions: { cus_a: [{ id: 'sub_1', status: 'active' }] },
      fail: { 'GET /subscriptions': new FakeStripeError(503) },
    });
    await assert.rejects(stopBillingForCustomers(['cus_a'], call), /fake stripe 503/);
  }
  {
    const { call } = fakeStripe({
      subscriptions: { cus_a: [{ id: 'sub_1', status: 'active' }] },
      fail: { 'DELETE /subscriptions/sub_1': new FakeStripeError(500) },
    });
    await assert.rejects(stopBillingForCustomers(['cus_a'], call), /fake stripe 500/);
  }
  {
    // A refused cancellation (not "missing") also blocks deletion.
    const { call } = fakeStripe({
      subscriptions: { cus_a: [{ id: 'sub_1', status: 'active' }] },
      fail: { 'DELETE /subscriptions/sub_1': new FakeStripeError(400, 'some_refusal') },
    });
    await assert.rejects(stopBillingForCustomers(['cus_a'], call));
  }
  {
    // Rate limited or a network failure while closing a Checkout page: stop, do not carry on.
    const { call } = fakeStripe({
      subscriptions: { cus_a: [] },
      openSessions: { cus_a: ['cs_open'] },
      fail: { 'POST /checkout/sessions/cs_open/expire': new FakeStripeError(429) },
    });
    await assert.rejects(stopBillingForCustomers(['cus_a'], call), /fake stripe 429/);
  }

  // 8. A subscription cancelled elsewhere between list and cancel is not an error.
  {
    const { call } = fakeStripe({
      subscriptions: { cus_a: [{ id: 'sub_1', status: 'active' }] },
      fail: { 'DELETE /subscriptions/sub_1': new FakeStripeError(404, 'resource_missing') },
    });
    const result = await stopBillingForCustomers(['cus_a'], call);
    assert.deepEqual(result.canceledSubscriptions, []);
  }

  // 9. Duplicates and blanks in the customer list are ignored.
  {
    const { call, calls } = fakeStripe({ subscriptions: { cus_a: [{ id: 'sub_1', status: 'active' }] } });
    await stopBillingForCustomers(['cus_a', '', 'cus_a'], call);
    assert.equal(calls.filter((c) => c.method === 'DELETE').length, 1);
  }

  assert.equal(isStripeMissingError(new FakeStripeError(400, 'resource_missing')), true);
  assert.equal(isStripeMissingError(new FakeStripeError(404)), true);
  assert.equal(isStripeMissingError(new FakeStripeError(500)), false);
  assert.equal(isStripeMissingError(new Error('network')), false);

  // --- Source rules for the function itself ---
  const index = fs.readFileSync(path.join(supabaseRoot, 'functions/delete-user-account/index.ts'), 'utf8');
  const stopAt = index.indexOf('await stopUserBilling(admin, userId)');
  const dataAt = index.indexOf("rpc('delete_user_owned_data'");
  const authAt = index.indexOf('auth.admin.deleteUser(userId)');
  assert.ok(stopAt > 0, 'deletion stops billing');
  assert.ok(stopAt < dataAt && dataAt < authAt, 'billing is stopped before any data or the account is deleted');
  assert.match(index, /if \(!\(await stopUserBilling\(admin, userId\)\)\) \{\s*return cancelFailedResponse\(\);/);
  // The customer to cancel comes from our own table for the verified user, never from the request.
  assert.match(index, /\.from\('billing_subscriptions'\)[\s\S]{0,120}\.eq\('user_id', userId\)/);
  assert.doesNotMatch(index, /req\.json\(\)/, 'nothing in the request body is trusted');
  // Billing rows are kept for the consent record; this function must not delete them.
  assert.doesNotMatch(index, /from\('billing_(subscriptions|consents)'\)\s*\.delete\(/);
  // No secret values in logs.
  assert.doesNotMatch(index, /console\.\w+\([^)]*stripeSecretKey/);

  const shared = fs.readFileSync(path.join(supabaseRoot, 'functions/_shared/billingServer.ts'), 'utf8');
  assert.match(shared, /method: 'GET' \| 'POST' \| 'DELETE'/, 'stripeRequest can cancel');

  const workflow = fs.readFileSync(path.join(supabaseRoot, '../.github/workflows/deploy-function.yml'), 'utf8');
  assert.match(workflow, /- delete-user-account/, 'delete-user-account is deployable from the workflow');

  // Terms and privacy pages (compliance handoff 1, items 5 and 7): checked in
  // scripts/legal-pages-check.ts (app/public/terms.html, privacy.html).

  console.log('delete-account-billing-check: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
