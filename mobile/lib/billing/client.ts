import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, isDemoMode } from '../../config/appConfig';
import type { PaidTier } from '../../config/planTiers';
import { PLUS_UPGRADE_COPY, type BillingInterval } from '../../config/pricing';
import { getSupabase } from '../supabase';
import { isStripeHostedUrl } from './checkoutReturn';

export class BillingError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function postBillingFunction(name: 'stripe-checkout' | 'stripe-portal', body: unknown): Promise<string> {
  if (isDemoMode()) {
    throw new BillingError(PLUS_UPGRADE_COPY.notConfigured, 'DEMO_MODE');
  }
  const client = getSupabase();
  const base = SUPABASE_URL.trim().replace(/\/$/, '');
  if (!client || !base) {
    throw new BillingError(PLUS_UPGRADE_COPY.notConfigured, 'NOT_CONFIGURED');
  }

  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new BillingError(PLUS_UPGRADE_COPY.signInHint, 'UNAUTHENTICATED');
  }

  const response = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => ({}))) as { url?: unknown; error?: string; code?: string };
  if (!response.ok || typeof json.url !== 'string' || !json.url) {
    throw new BillingError(billingErrorMessage(name, json.code), json.code ?? 'UPSTREAM_ERROR');
  }
  return json.url;
}

/** Our own wording for each failure; server messages are not shown raw. */
export function billingErrorMessage(name: 'stripe-checkout' | 'stripe-portal', code: string | undefined): string {
  if (code === 'ALREADY_SUBSCRIBED') return PLUS_UPGRADE_COPY.alreadySubscribed;
  if (code === 'NOT_CONFIGURED' || code === 'PRICE_NOT_FOUND') return PLUS_UPGRADE_COPY.notConfigured;
  if (code === 'UNAUTHENTICATED') return PLUS_UPGRADE_COPY.signInHint;
  return name === 'stripe-portal' ? PLUS_UPGRADE_COPY.manageError : PLUS_UPGRADE_COPY.genericError;
}

function leaveForStripe(url: string, name: 'stripe-checkout' | 'stripe-portal'): void {
  if (!isStripeHostedUrl(url) || typeof window === 'undefined') {
    throw new BillingError(billingErrorMessage(name, undefined), 'BAD_REDIRECT');
  }
  window.location.assign(url);
}

/** Starts a purchase of a paid plan: asks our server for a Stripe Checkout page and goes there. */
export async function startPlanCheckout(tier: PaidTier, interval: BillingInterval): Promise<void> {
  const url = await postBillingFunction('stripe-checkout', { interval, tier });
  leaveForStripe(url, 'stripe-checkout');
}

/** Opens Stripe's page for cancelling, changing the card and viewing invoices. */
export async function openBillingPortal(): Promise<void> {
  const url = await postBillingFunction('stripe-portal', {});
  leaveForStripe(url, 'stripe-portal');
}

export interface OwnSubscription {
  status: string | null;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * The signed-in user's own subscription row, or null when they never subscribed.
 * Row-level security only ever returns the caller's row.
 */
export async function fetchOwnSubscription(client: SupabaseClient): Promise<OwnSubscription | null> {
  const { data, error } = await client
    .from('billing_subscriptions')
    .select('status, billing_interval, current_period_end, cancel_at_period_end, stripe_subscription_id')
    .not('stripe_subscription_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) return null;
  const row = (data ?? [])[0] as
    | { status: string | null; billing_interval: string | null; current_period_end: string | null; cancel_at_period_end: boolean | null }
    | undefined;
  if (!row) return null;
  return {
    status: row.status,
    billingInterval: row.billing_interval,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
  };
}

export function isLiveSubscription(subscription: OwnSubscription | null): boolean {
  const status = subscription?.status;
  return status === 'active' || status === 'trialing' || status === 'past_due';
}
