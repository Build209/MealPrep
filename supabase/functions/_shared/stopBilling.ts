// Stops all future charges for a set of Stripe customers. Used when an account is deleted.
// Pure logic: the Stripe call is passed in, so this can be unit-tested with tsx.

export type StripeMethod = 'GET' | 'POST' | 'DELETE';

export type StripeForm = { [key: string]: string | number | boolean | null | undefined };

/** One call to Stripe's REST API. Must throw on a non-2xx reply (see StripeRequestError). */
export type StripeCall = <T>(method: StripeMethod, path: string, form?: StripeForm) => Promise<T>;

interface StripeList<T> {
  data?: T[];
  has_more?: boolean;
}

/** Statuses where the subscription has already ended and nothing more will be charged. */
const ENDED_SUBSCRIPTION_STATUSES = ['canceled', 'incomplete_expired'];

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export interface StopBillingResult {
  canceledSubscriptions: string[];
  expiredCheckoutSessions: string[];
  /** Customers Stripe does not know under this key (for example a test-mode id seen by a live key). */
  missingCustomers: string[];
}

function errorField(error: unknown, field: 'stripeCode' | 'status'): unknown {
  return error && typeof error === 'object' ? (error as Record<string, unknown>)[field] : undefined;
}

/** Stripe says the object does not exist. There is nothing left to charge on it. */
export function isStripeMissingError(error: unknown): boolean {
  return errorField(error, 'stripeCode') === 'resource_missing' || errorField(error, 'status') === 404;
}

/** A 4xx reply: Stripe understood the request and refused it. Retrying will not change the answer. */
function isStripeClientError(error: unknown): boolean {
  const status = errorField(error, 'status');
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 429;
}

async function listAll<T extends { id: string }>(call: StripeCall, path: string, query: StripeForm): Promise<T[]> {
  const all: T[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const list = await call<StripeList<T>>('GET', path, { ...query, limit: PAGE_SIZE, starting_after: startingAfter });
    const rows = list.data ?? [];
    all.push(...rows);
    if (!list.has_more || rows.length === 0) break;
    startingAfter = rows[rows.length - 1].id;
  }
  return all;
}

/**
 * For each customer: close any open Checkout page, then cancel every subscription that has not
 * already ended. Open pages go first so a payment cannot land after the subscriptions are listed.
 *
 * Throws when Stripe cannot be reached or a cancellation is refused. The caller must then NOT
 * delete the account: a deleted account with a live subscription keeps being charged and has no
 * way left to cancel.
 */
export async function stopBillingForCustomers(customerIds: string[], call: StripeCall): Promise<StopBillingResult> {
  const result: StopBillingResult = { canceledSubscriptions: [], expiredCheckoutSessions: [], missingCustomers: [] };

  for (const customerId of [...new Set(customerIds.filter(Boolean))]) {
    let sessions: Array<{ id: string }>;
    try {
      sessions = await listAll<{ id: string }>(call, '/checkout/sessions', { customer: customerId, status: 'open' });
    } catch (error) {
      if (isStripeMissingError(error)) {
        result.missingCustomers.push(customerId);
        continue;
      }
      throw error;
    }

    for (const session of sessions) {
      try {
        await call('POST', `/checkout/sessions/${encodeURIComponent(session.id)}/expire`);
        result.expiredCheckoutSessions.push(session.id);
      } catch (error) {
        // The page was paid or expired a moment ago. If it was paid, the subscription it
        // created is in the list below and is cancelled there.
        if (!isStripeClientError(error)) throw error;
      }
    }

    let subscriptions: Array<{ id: string; status?: string }>;
    try {
      subscriptions = await listAll<{ id: string; status?: string }>(call, '/subscriptions', {
        customer: customerId,
        status: 'all',
      });
    } catch (error) {
      if (isStripeMissingError(error)) {
        result.missingCustomers.push(customerId);
        continue;
      }
      throw error;
    }
    for (const subscription of subscriptions) {
      if (ENDED_SUBSCRIPTION_STATUSES.includes(subscription.status ?? '')) continue;
      try {
        await call('DELETE', `/subscriptions/${encodeURIComponent(subscription.id)}`);
        result.canceledSubscriptions.push(subscription.id);
      } catch (error) {
        if (!isStripeMissingError(error)) throw error;
      }
    }
  }

  return result;
}
