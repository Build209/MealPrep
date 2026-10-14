// Pure rules that stop a customer ending up with two subscriptions (testing's T-5).
// No network, database or Deno APIs here, so they can be unit-tested with tsx.

/** Stripe statuses where the customer is being charged, or will be. Mirrors isLiveSubscriptionStatus. */
const LIVE_STATUSES = ['active', 'trialing', 'past_due'];

/**
 * Asked of Stripe itself, not our table: our row only shows a subscription after the webhook
 * lands, and a second Checkout page opened in that gap would otherwise be payable.
 */
export function hasLiveStripeSubscription(subscriptions: ReadonlyArray<{ status?: string | null }>): boolean {
  return subscriptions.some((sub) => LIVE_STATUSES.includes(sub.status ?? ''));
}

export interface OpenCheckoutSession {
  id: string;
  url?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
}

/**
 * What to do with Checkout pages that are still open for this customer.
 * - A page for the same price is handed back, so pressing Upgrade twice never makes two pages.
 * - Any other open page (the other plan, or one with no usable link) is closed first, so only
 *   one page can ever be paid.
 */
export function planOpenCheckoutSessions(
  sessions: ReadonlyArray<OpenCheckoutSession>,
  wanted: { priceId: string },
): { reuseUrl: string | null; expireIds: string[] } {
  const usable = sessions.find(
    (session) => typeof session.url === 'string' && session.url.length > 0 && session.metadata?.price_id === wanted.priceId,
  );
  return {
    reuseUrl: usable?.url ?? null,
    expireIds: sessions.filter((session) => session.id !== usable?.id).map((session) => session.id),
  };
}

/** Stripe does not know this customer id under the current key (for example a test-mode id seen by a live key). */
export function isUnknownStripeCustomer(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { stripeCode?: unknown; status?: unknown };
  return row.stripeCode === 'resource_missing' || row.status === 404;
}
