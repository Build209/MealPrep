// Pure billing helpers shared by stripe-checkout and stripe-portal.
// No network, database or Deno APIs here, so they can be unit-tested with tsx.

import { isPaidTier, priceLookupKey, TIER_NAMES, type PaidTier } from './planTiers.ts';

/**
 * Version of the renewal wording shown at checkout. Stored with each consent record so we can
 * prove what the customer agreed to. Bump it whenever the wording below changes.
 */
export const DISCLOSURE_VERSION = '2026-10-11.1';

/** Version of the Terms of Use the customer accepts at checkout (the date printed on the page). */
export const TERMS_VERSION = '2026-10-11';

export type BillingInterval = 'month' | 'year';

/** Lookup key of the Stripe price for a tier and period: plus_monthly, pro_yearly, family_monthly, ... */
export function lookupKeyFor(tier: PaidTier, interval: BillingInterval): string {
  return priceLookupKey(tier, interval);
}

export function parseBillingInterval(value: unknown): BillingInterval | null {
  return value === 'month' || value === 'year' ? value : null;
}

/**
 * The tier being bought. A request that names no tier is Plus (app versions from before tiers
 * send only the period); anything else that is not a paid tier is refused.
 */
export function parseCheckoutTier(value: unknown): PaidTier | null {
  if (value === undefined || value === null) return 'plus';
  return isPaidTier(value) ? value : null;
}

/** 699 + 'usd' -> "$6.99"; 6000 -> "$60". Only USD is sold today; other currencies print the code. */
export function formatPrice(unitAmount: number, currency: string): string {
  const major = unitAmount / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return currency.toLowerCase() === 'usd' ? `$${text}` : `${text} ${currency.toUpperCase()}`;
}

function periodWords(interval: BillingInterval): { a: string; every: string } {
  return interval === 'year' ? { a: 'a year', every: 'every year' } : { a: 'a month', every: 'every month' };
}

/**
 * Renewal terms shown right beside the pay button (California automatic renewal law: price,
 * renewal period and how to cancel must be clear where the customer agrees).
 * Built from the real Stripe price so the words can never disagree with the charge.
 */
export function renewalDisclosure(
  unitAmount: number,
  currency: string,
  interval: BillingInterval,
  tier: PaidTier = 'plus',
): string {
  const price = formatPrice(unitAmount, currency);
  const period = periodWords(interval);
  return (
    `${TIER_NAMES[tier]} is ${price} ${period.a}. It renews automatically ${period.every} until you cancel. ` +
    'Cancel any time in Account, Manage subscription.'
  );
}

/** Text for the required, unticked consent box. Stripe renders the markdown link. */
export function consentCheckboxText(
  unitAmount: number,
  currency: string,
  interval: BillingInterval,
  termsUrl: string,
  tier: PaidTier = 'plus',
): string {
  const price = formatPrice(unitAmount, currency);
  const period = periodWords(interval);
  return (
    `I agree that ${TIER_NAMES[tier]} renews automatically at ${price} ${period.every} until I cancel, ` +
    `and I accept the [Terms of Use](${termsUrl}).`
  );
}

/** App root with exactly one trailing slash, or null when it is not an https URL. */
export function normalizeAppUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) return null;
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

/**
 * Where Stripe sends the customer back. A query string on the app root needs no extra route on
 * GitHub Pages. Return URLs come from server configuration only, never from the request.
 */
export function checkoutReturnUrls(appUrl: string): { success: string; cancel: string; portal: string; terms: string } {
  return {
    success: `${appUrl}?checkout=success`,
    cancel: `${appUrl}?checkout=cancel`,
    portal: `${appUrl}?billing=return`,
    terms: `${appUrl}terms.html`,
  };
}

type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

/**
 * Stripe's API takes form-encoded bodies with bracket keys:
 * { line_items: [{ price: 'p', quantity: 1 }] } -> line_items[0][price]=p&line_items[0][quantity]=1
 * null and undefined values are skipped.
 */
export function encodeStripeForm(data: { [key: string]: FormValue }): string {
  const params = new URLSearchParams();
  const walk = (prefix: string, value: FormValue): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(`${prefix}[${index}]`, item));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) walk(`${prefix}[${key}]`, inner);
      return;
    }
    params.append(prefix, String(value));
  };
  for (const [key, value] of Object.entries(data)) walk(key, value);
  return params.toString();
}

/** Mirrors PLUS_ACTIVE_STATUSES in stripe-webhook and recompute_user_plan() in SQL. */
export function isLiveSubscriptionStatus(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}
