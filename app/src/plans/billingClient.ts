/**
 * Calls the live stripe-checkout and stripe-portal edge functions exactly as the old app does
 * (mobile/lib/billing/client.ts): POST to <SUPABASE_URL>/functions/v1/<name> with the signed-in
 * user's access token as a Bearer token and a JSON body, read `{ url }` back, and send the browser
 * there only if it is a Stripe-hosted page. The app never sees or handles card details: Stripe's
 * own page takes the payment (and shows the required unticked renewal consent box).
 *
 * No change to either function or to Stripe comes with this file.
 */
import { env } from '../lib/env';
import { getSupabase } from '../lib/supabase';
import {
  billingErrorMessage,
  checkoutBody,
  isStripeHostedUrl,
  type BillingFunction,
  type BillingInterval,
} from './pricing';
import { PLANS_COPY } from './copy';
import type { PaidTier } from '../scan/planTiers';

export class BillingError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
  }
}

async function postBillingFunction(name: BillingFunction, body: unknown): Promise<string> {
  const client = getSupabase();
  const base = env.supabaseUrl.trim().replace(/\/$/, '');
  if (!client || !base) throw new BillingError(PLANS_COPY.notConfigured, 'NOT_CONFIGURED');

  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new BillingError(PLANS_COPY.signInHint, 'UNAUTHENTICATED');

  let response: Response;
  try {
    response = await fetch(`${base}/functions/v1/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new BillingError(billingErrorMessage(name, undefined), 'NETWORK');
  }

  const json = (await response.json().catch(() => ({}))) as { url?: unknown; code?: string };
  if (!response.ok || typeof json.url !== 'string' || !json.url) {
    throw new BillingError(billingErrorMessage(name, json.code), json.code ?? 'UPSTREAM_ERROR');
  }
  return json.url;
}

function leaveForStripe(url: string, name: BillingFunction): void {
  if (!isStripeHostedUrl(url) || typeof window === 'undefined' || !window.location) {
    throw new BillingError(billingErrorMessage(name, undefined), 'BAD_REDIRECT');
  }
  window.location.assign(url);
}

/** Starts a purchase: asks our server for a Stripe Checkout page and goes there. */
export async function startPlanCheckout(tier: PaidTier, interval: BillingInterval): Promise<void> {
  const url = await postBillingFunction('stripe-checkout', checkoutBody(tier, interval));
  leaveForStripe(url, 'stripe-checkout');
}

/** Opens Stripe's page for cancelling, changing the card and viewing invoices. */
export async function openBillingPortal(): Promise<void> {
  const url = await postBillingFunction('stripe-portal', {});
  leaveForStripe(url, 'stripe-portal');
}
