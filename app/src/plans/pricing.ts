/**
 * Prices, limits and renewal terms as the plans screen shows them. Pure functions only
 * (tests/plans-pricing.test.ts).
 *
 * Ported from the live app (mobile/lib/billing/pricing.ts, mobile/config/planTiers.ts,
 * mobile/lib/billing/client.ts). Prices come from TIER_PRICE_CENTS in src/scan/planTiers.ts, the
 * verbatim copy of the table the live stripe-checkout function checks Stripe's price against, so
 * the price said here is the price charged. The renewal sentence must stay word for word the same
 * as `renewalDisclosure` in supabase/functions/_shared/billingText.ts (DISCLOSURE_VERSION
 * 2026-10-11.1), which is what the customer's consent record names.
 */
import { PLANS_COPY, SUBSCRIPTION_STATUS_COPY } from './copy';
import {
  PAID_TIERS,
  priceLookupKey,
  TIER_LIMITS,
  TIER_NAMES,
  TIER_PRICE_CENTS,
  type PaidTier,
  type PlanTier,
} from '../scan/planTiers';

export type BillingInterval = 'month' | 'year';

/** Order of the plan rows; the first is chosen to start with (live: PLAN_TIER_ORDER). */
export const PLAN_TIER_ORDER: readonly PaidTier[] = PAID_TIERS;

/** Order of the monthly/yearly switch; the first is chosen to start with (live: PLUS_INTERVAL_ORDER). */
export const INTERVAL_ORDER: readonly BillingInterval[] = ['year', 'month'];

/** Short name for a plan row (live: TIER_SHORT_NAMES). */
export const TIER_SHORT_NAMES: Record<PaidTier, string> = {
  plus: 'Plus',
  pro: 'Pro',
  family: 'Family',
};

export const INTERVAL_LABELS: Record<BillingInterval, string> = {
  year: PLANS_COPY.payYearly,
  month: PLANS_COPY.payMonthly,
};

/** 499 -> "$4.99", 2000 -> "$20". */
export function formatTierPrice(tier: PaidTier, interval: BillingInterval): string {
  const major = TIER_PRICE_CENTS[tier][interval] / 100;
  return `$${Number.isInteger(major) ? String(major) : major.toFixed(2)}`;
}

function periodWords(interval: BillingInterval): { a: string; every: string } {
  return interval === 'year' ? { a: 'a year', every: 'every year' } : { a: 'a month', every: 'every month' };
}

/** "$53.88 a year" / "$4.99 a month" */
export function tierPriceLabel(tier: PaidTier, interval: BillingInterval): string {
  return `${formatTierPrice(tier, interval)} ${periodWords(interval).a}`;
}

/** The buy button says exactly what it does and what it costs: "Subscribe for $4.99 a month". */
export function tierSubscribeLabel(tier: PaidTier, interval: BillingInterval): string {
  return `Subscribe for ${tierPriceLabel(tier, interval)}`;
}

/** Renewal terms shown directly above the buy button: price, renewal period, how to cancel. */
export function tierRenewalDisclosure(tier: PaidTier, interval: BillingInterval): string {
  const period = periodWords(interval);
  return (
    `${TIER_NAMES[tier]} is ${formatTierPrice(tier, interval)} ${period.a}. ` +
    `It renews automatically ${period.every} until you cancel. ` +
    'Cancel any time in Account, Manage subscription.'
  );
}

/** "15 scans, 5 recipe imports and 15 Ask Forky questions a month" (live: tierLimitsLine). */
export function tierLimitsLine(tier: PlanTier): string {
  const limits = TIER_LIMITS[tier];
  return `${limits.scans} scans, ${limits.imports} recipe imports and ${limits.forkyQuestions} Ask Forky questions a month`;
}

/** "MealPlanatic Plus: 15 scans, ... a month." The chosen plan's limits, above its renewal terms. */
export function tierLimitsSentence(tier: PlanTier): string {
  return `${TIER_NAMES[tier]}: ${tierLimitsLine(tier)}.`;
}

/** Screen reader label of a plan row (live wording). */
export function tierRowLabel(tier: PaidTier, interval: BillingInterval): string {
  return `${TIER_NAMES[tier]}, ${tierPriceLabel(tier, interval)}: ${tierLimitsLine(tier)}`;
}

/**
 * What stripe-checkout is sent. Exactly the old app's body: the tier and the period; the server
 * picks the Stripe price by lookup key (`priceLookupKey`) and never takes a price from the app.
 */
export function checkoutBody(tier: PaidTier, interval: BillingInterval): { interval: BillingInterval; tier: PaidTier } {
  return { interval, tier };
}

/** The Stripe price lookup key the server will use for this choice (plus_yearly, pro_monthly, ...). */
export function checkoutLookupKey(tier: PaidTier, interval: BillingInterval): string {
  return priceLookupKey(tier, interval);
}

/** Only ever send the browser to Stripe's own pages (live: isStripeHostedUrl). */
export function isStripeHostedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'checkout.stripe.com' || parsed.hostname === 'billing.stripe.com')
    );
  } catch {
    return false;
  }
}

export type BillingFunction = 'stripe-checkout' | 'stripe-portal';

/** Our own wording for each failure; server messages are never shown raw (live: billingErrorMessage). */
export function billingErrorMessage(name: BillingFunction, code: string | undefined): string {
  if (code === 'ALREADY_SUBSCRIBED') return PLANS_COPY.alreadySubscribed;
  if (code === 'NOT_CONFIGURED' || code === 'PRICE_NOT_FOUND') return PLANS_COPY.notConfigured;
  if (code === 'UNAUTHENTICATED') return PLANS_COPY.signInHint;
  return name === 'stripe-portal' ? PLANS_COPY.manageError : PLANS_COPY.genericError;
}

export interface OwnSubscription {
  status: string | null;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  planTier: string | null;
}

/** active, trialing and past_due keep the plan on (same rule as recompute_user_plan). */
export function isLiveSubscription(subscription: OwnSubscription | null | undefined): boolean {
  const status = subscription?.status;
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

function formatDate(iso: string | null, locale?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** One plain line on what happens next with the subscription (live: subscriptionStatusLine). */
export function subscriptionStatusLine(subscription: OwnSubscription, locale?: string): string | null {
  if (subscription.status === 'past_due') return SUBSCRIPTION_STATUS_COPY.pastDue;
  const date = formatDate(subscription.currentPeriodEnd, locale);
  if (!date) return null;
  return subscription.cancelAtPeriodEnd ? SUBSCRIPTION_STATUS_COPY.endsOn(date) : SUBSCRIPTION_STATUS_COPY.renewsOn(date);
}

/**
 * What the screen offers, from the profile and the subscription row (live AccountPlanSection rules):
 * buying only for a free account with no live subscription, on the web; Manage only with a live
 * subscription; the "nothing to pay" line for a paid account with no subscription (a comp).
 */
export function planScreenState(input: {
  plan: string | null | undefined;
  subscription: OwnSubscription | null | undefined;
  canBuyHere: boolean;
}): { isPaid: boolean; showBuy: boolean; showManage: boolean; showComped: boolean } {
  const isPaid = input.plan === 'paid';
  const live = isLiveSubscription(input.subscription);
  return {
    isPaid,
    showBuy: !isPaid && !live && input.canBuyHere,
    showManage: live,
    showComped: isPaid && !live && input.canBuyHere,
  };
}
