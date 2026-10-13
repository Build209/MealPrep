/**
 * The scan allowance shown on the Scan button, worked out the same way the live pantry-vision
 * function does: tier from profiles.plan + plan_tier (admins are never capped), limit from
 * planTiers.ts, used count from this month's photo_scan_usage row. Shelf, fridge and receipt
 * photos share one pool. Pure functions only (tests/scan-allowance.test.ts).
 *
 * The server stays the judge: this only says what to expect. While anything is unknown the
 * button promises nothing ("Scan").
 */
import { tierForProfile, TIER_LIMITS, usageMonth, type PlanTier } from './planTiers';

export type ScanTier = 'admin' | PlanTier;

export type Allowance =
  | { state: 'unknown' }
  | { state: 'uncapped' }
  | { state: 'capped'; tier: PlanTier; limit: number; used: number; remaining: number };

/** The tier pantry-vision uses (loadScanTier in the function). */
export function scanTierFor(profile: { role?: string | null; plan?: string | null; planTier?: string | null }): ScanTier {
  if (profile.role === 'admin') return 'admin';
  return tierForProfile(profile.plan, profile.planTier);
}

/** The month's usage row key, in UTC, as the function writes it ('2026-10'). */
export function currentUsagePeriod(now: Date = new Date()): string {
  return usageMonth(now);
}

/**
 * `used` is the month's `scans` count (0 when there is no row yet), or null when it could not be read.
 * `tier` is null while the profile is loading.
 */
export function allowanceFor(tier: ScanTier | null, used: number | null): Allowance {
  if (tier === null) return { state: 'unknown' };
  if (tier === 'admin') return { state: 'uncapped' };
  if (used === null || !Number.isFinite(used)) return { state: 'unknown' };
  const limit = TIER_LIMITS[tier].scans;
  const usedWhole = Math.max(0, Math.floor(used));
  return { state: 'capped', tier, limit, used: usedWhole, remaining: Math.max(0, limit - usedWhole) };
}

/** "Scan · 2 left this month", "Scan · none left this month", or just "Scan" when nothing is known. */
export function allowanceText(allowance: Allowance, base: string = 'Scan'): string {
  if (allowance.state !== 'capped') return base;
  if (allowance.remaining <= 0) return `${base} · none left this month`;
  return `${base} · ${allowance.remaining} left this month`;
}

/** A sentence for the scan screen, or null when there is nothing worth saying. */
export function allowanceNote(allowance: Allowance): string | null {
  if (allowance.state !== 'capped') return null;
  if (allowance.remaining > 0) {
    return `${allowance.remaining} of ${allowance.limit} scans left this month. Shelf, fridge and receipt photos share them.`;
  }
  return allowance.tier === 'free'
    ? `You've used your ${allowance.limit} free scans this month. They start again on the 1st. A paid plan includes more.`
    : `You've used all ${allowance.limit} scans this month. They start again on the 1st.`;
}

/** Usage the function returns with a scan: `{ limit, remaining }` are null when the account is not capped. */
export type ScanUsage = { isPlus?: boolean; tier?: string; limit: number | null; remaining: number | null };

/** The used count implied by a scan response, or null when the response does not say. */
export function usedFromResponse(usage: ScanUsage | null | undefined): number | null {
  if (!usage || typeof usage.limit !== 'number' || typeof usage.remaining !== 'number') return null;
  return Math.max(0, usage.limit - usage.remaining);
}
