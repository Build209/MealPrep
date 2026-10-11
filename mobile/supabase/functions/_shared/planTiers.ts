// Plan tiers and their monthly limits: the one table the scanner, Ask Forky, recipe import and
// checkout all read. No network, database or Deno APIs here, so it can be unit-tested with tsx.
//
// The numbers are printed on the Terms of Use page (public/terms.html) and beside the buy
// button. A change here is a change to what customers were promised: change the terms, the
// app copy (config/planTiers.ts) and TERMS_VERSION in the same pull request, and tell
// compliance first.

export const PLAN_TIERS = ['free', 'plus', 'pro', 'family'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PAID_TIERS = ['plus', 'pro', 'family'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

export interface TierLimits {
  /** Pantry, fridge and receipt photos a calendar month (one shared pool). */
  scans: number;
  /** Recipes imported a calendar month from a link, text, photo, screenshot or video. */
  imports: number;
  /** Ask Forky questions a calendar month. */
  forkyQuestions: number;
  /** Store price-tag photos a calendar month (small, cheap calls; counted apart). 0 = not included. */
  priceTagScans: number;
}

/** Owner's decision, 2026-10-11. Every allowance, the free one included, starts again each month. */
export const TIER_LIMITS: Record<PlanTier, TierLimits> = {
  free: { scans: 3, imports: 2, forkyQuestions: 5, priceTagScans: 0 },
  plus: { scans: 15, imports: 5, forkyQuestions: 15, priceTagScans: 200 },
  pro: { scans: 25, imports: 10, forkyQuestions: 30, priceTagScans: 200 },
  family: { scans: 50, imports: 25, forkyQuestions: 60, priceTagScans: 200 },
};

export const TIER_NAMES: Record<PlanTier, string> = {
  free: 'Free',
  plus: 'MealPlanatic Plus',
  pro: 'MealPlanatic Pro',
  family: 'MealPlanatic Family',
};

export function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === 'string' && (PAID_TIERS as readonly string[]).includes(value);
}

/**
 * The tier an account is on. `profiles.plan` stays the paid/free switch; `profiles.plan_tier`
 * says which paid tier. A paid account with no readable tier (the column is not there yet, or an
 * older row) is Plus, the smallest paid tier, so nobody is given more than they bought.
 */
export function tierForProfile(plan: string | null | undefined, planTier: string | null | undefined): PlanTier {
  if (plan !== 'paid') return 'free';
  return isPaidTier(planTier) ? planTier : 'plus';
}

/** Row key for a month's usage, in UTC: '2026-10'. Allowances start again on the 1st. */
export function usageMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export type BillingIntervalKey = 'month' | 'year';

/**
 * Stripe price lookup keys: plus_monthly, plus_yearly, pro_monthly, pro_yearly, family_monthly,
 * family_yearly. Test and live mode use the same keys, so the switch needs no code change.
 */
export function priceLookupKey(tier: PaidTier, interval: BillingIntervalKey): string {
  return `${tier}_${interval === 'year' ? 'yearly' : 'monthly'}`;
}

/** Which tier a Stripe price belongs to, from its lookup key. Null for anything we did not create. */
export function tierFromLookupKey(lookupKey: unknown): PaidTier | null {
  if (typeof lookupKey !== 'string') return null;
  const match = /^(plus|pro|family)_(monthly|yearly)$/.exec(lookupKey.trim());
  return match ? (match[1] as PaidTier) : null;
}

const LIMIT_FIELDS = ['scans', 'imports', 'forkyQuestions', 'priceTagScans'] as const;

/**
 * Limits for a tier, after the optional PLAN_LIMITS_OVERRIDE secret.
 *
 * The secret is a cost brake for an emergency (a vendor price jump, abuse), for example
 *   {"free":{"scans":0},"family":{"imports":10}}
 * It can only LOWER a limit: nothing set there can give a customer more than the terms say, and
 * a value that is not a whole number from 0 up is ignored. Lowering a paid tier below the
 * published number breaks the terms, so tell compliance before using it on one.
 */
export function tierLimits(tier: PlanTier, overrideJson?: string | null): TierLimits {
  const base = TIER_LIMITS[tier];
  const text = (overrideJson ?? '').trim();
  if (!text) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return base;
  }
  const forTier =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[tier] : null;
  if (!forTier || typeof forTier !== 'object') return base;
  const result: TierLimits = { ...base };
  for (const field of LIMIT_FIELDS) {
    const value = (forTier as Record<string, unknown>)[field];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < base[field]) {
      result[field] = value;
    }
  }
  return result;
}
