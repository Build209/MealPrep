import type { UserRole } from '../types/mealprep';
import { TIER_LIMITS, TIER_NAMES, tierForProfile, type PaidTier } from './planTiers';

/** Paid tiers; see `config/familyPlans.ts` for future `family` placeholder. */
export const USER_PLANS = ['free', 'paid'] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export const DEFAULT_USER_PLAN: UserPlan = 'free';

export const PLAN_LABELS: Record<UserPlan, string> = {
  free: 'Free',
  paid: 'MealPlanatic Plus',
};

/** The name of the plan an account is on, down to the paid tier: "MealPlanatic Pro". */
export function planLabel(plan: UserPlan, planTier: PaidTier | null | undefined): string {
  return TIER_NAMES[tierForProfile(plan, planTier)];
}

export const PLANS_COPY = {
  photoScanUpgradeTitle: 'More scans come with a paid plan',
  photoScanUpgradeBody:
    'A free account has a few scans each month. Upgrade to a paid plan for more scans of shelves and receipts, and shelf tags in Smart Shop. Manual entry stays free.',
  photoScanProfileLoading: 'Loading your plan… try again in a moment.',
  photoScanProfileLoadingTitle: 'One moment',
  /** Badge on the scan card for a free account that still has free scans. */
  freeScansLeftBadge: (remaining: number) => `${remaining} free`,
  freeScansLeftNote: (remaining: number) =>
    remaining === 1
      ? 'You have 1 free scan left this month. A paid plan includes more.'
      : `You have ${remaining} free scans left this month. A paid plan includes more.`,
  freeScansUsedNote: 'That was your last free scan this month. They start again on the 1st, and a paid plan includes more.',
} as const;

/**
 * Free scans a month for a free account: shelf, fridge and receipt photos share them. The server
 * enforces the real number (supabase/functions/_shared/planTiers.ts); this is only used to show
 * how many are left. Price tags are for paid plans only.
 */
export const FREE_PHOTO_SCANS = TIER_LIMITS.free.scans;

/** Admins always have Plus photo-scan access (same as paid). */
export function hasPlusPhotoScanAccess(plan: UserPlan, role: UserRole): boolean {
  return role === 'admin' || plan === 'paid';
}

export function isUserPlan(value: string): value is UserPlan {
  return (USER_PLANS as readonly string[]).includes(value);
}
