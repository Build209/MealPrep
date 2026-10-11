/**
 * Plan tiers and their monthly limits, as the app shows them.
 *
 * The server enforces the real numbers (supabase/functions/_shared/planTiers.ts) and the terms
 * page prints them; scripts/plan-tiers-check.ts fails if the three ever disagree. A change here
 * is a change to what customers were promised: tell compliance first.
 */
export const PAID_TIERS = ['plus', 'pro', 'family'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];
export type PlanTier = 'free' | PaidTier;

export const DEFAULT_PAID_TIER: PaidTier = 'plus';

export interface TierLimits {
  /** Pantry, fridge and receipt photos a month (one shared pool). */
  scans: number;
  /** Recipes imported a month from a link, text, photo, screenshot or video. */
  imports: number;
  /** Ask Forky questions a month. */
  forkyQuestions: number;
  /** Store price-tag photos a month. 0 = not included. */
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

/** Short name for a row in the plan choice. */
export const TIER_SHORT_NAMES: Record<PaidTier, string> = {
  plus: 'Plus',
  pro: 'Pro',
  family: 'Family',
};

export function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === 'string' && (PAID_TIERS as readonly string[]).includes(value);
}

/** The tier an account is on. A paid account with no readable tier is Plus, the smallest. */
export function tierForProfile(plan: string | null | undefined, planTier: string | null | undefined): PlanTier {
  if (plan !== 'paid') return 'free';
  return isPaidTier(planTier) ? planTier : DEFAULT_PAID_TIER;
}

/** Row key for this month's usage counts, in UTC ('2026-10'), the same key the server uses. */
export function usageMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * The limits in words, shown beside every price so the number is known before buying:
 * "15 scans, 5 recipe imports and 15 Ask Forky questions a month".
 */
export function tierLimitsLine(tier: PlanTier): string {
  const limits = TIER_LIMITS[tier];
  return `${limits.scans} scans, ${limits.imports} recipe imports and ${limits.forkyQuestions} Ask Forky questions a month`;
}
