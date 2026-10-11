import { TIER_LIMITS, tierForProfile, type PlanTier } from '../../config/planTiers';

/**
 * The plan whose Ask Forky allowance an account gets. Mirrors the server (`forkyAllowance` in
 * supabase/functions/_shared/askForkyText.ts): an admin account gets the largest allowance.
 */
export function askForkyTier(
  plan: string | null | undefined,
  planTier: string | null | undefined,
  role: string | null | undefined,
): PlanTier {
  return role === 'admin' ? 'family' : tierForProfile(plan, planTier);
}

/**
 * Questions left this month, from the count the account has already used. `null` when the
 * count could not be read: say nothing then, and let the server decide when a question is sent.
 */
export function askForkyQuestionsLeft(tier: PlanTier, usedThisMonth: number | null): number | null {
  if (usedThisMonth === null || !Number.isFinite(usedThisMonth)) return null;
  return Math.max(0, TIER_LIMITS[tier].forkyQuestions - Math.max(0, Math.floor(usedThisMonth)));
}
