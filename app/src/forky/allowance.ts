/**
 * The Ask Forky allowance shown on the chat screen, worked out the way the live ask-forky function
 * does (forkyAllowance in supabase/functions/_shared/askForkyText.ts): tier from
 * profiles.plan + plan_tier, an admin account gets the largest allowance (Family), the limit from
 * planTiers.ts, the used count from this month's forky_chat_usage row. Pure (tests/forky-allowance.test.ts).
 *
 * The server stays the judge: while anything is unknown the screen promises nothing.
 */
import { tierForProfile, TIER_LIMITS, type PlanTier } from '../scan/planTiers';

export type ForkyAllowance =
  | { state: 'unknown' }
  | { state: 'known'; tier: PlanTier; limit: number; used: number; remaining: number };

/** The tier the function counts against (old app: askForkyTier). */
export function forkyTierFor(profile: { role?: string | null; plan?: string | null; planTier?: string | null }): PlanTier {
  return profile.role === 'admin' ? 'family' : tierForProfile(profile.plan, profile.planTier);
}

/**
 * `used` is the month's `messages` count (0 when there is no row), or null when it could not be read.
 * `server` is what the function said with its last answer this month ({ limit, remaining }); it
 * wins, because the function can lower a limit (PLAN_LIMITS_OVERRIDE) and the app cannot see that.
 */
export function forkyAllowanceFor(
  tier: PlanTier | null,
  used: number | null,
  server: { limit: number; remaining: number } | null = null,
): ForkyAllowance {
  if (tier === null) return { state: 'unknown' };
  if (server && Number.isFinite(server.limit) && Number.isFinite(server.remaining)) {
    const limit = Math.max(0, Math.floor(server.limit));
    const remaining = Math.max(0, Math.min(limit, Math.floor(server.remaining)));
    return { state: 'known', tier, limit, used: limit - remaining, remaining };
  }
  if (used === null || !Number.isFinite(used)) return { state: 'unknown' };
  const limit = TIER_LIMITS[tier].forkyQuestions;
  const usedWhole = Math.max(0, Math.floor(used));
  return { state: 'known', tier, limit, used: usedWhole, remaining: Math.max(0, limit - usedWhole) };
}

/** True only when the month's questions are known to be used up. */
export function forkyUsedUp(allowance: ForkyAllowance): boolean {
  return allowance.state === 'known' && allowance.remaining <= 0;
}

/** A higher plan exists with more questions, so "See plans" is worth offering. */
export function morePlansExist(tier: PlanTier | null): boolean {
  return tier !== 'family';
}
