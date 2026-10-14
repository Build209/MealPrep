/**
 * Usage maths for the usage screen: this month's scans, recipe imports and Ask Forky questions
 * against the plan's monthly limit. Pure functions only (tests/plans-usage.test.ts).
 *
 * Counts come from the person's own rows in photo_scan_usage (scans), recipe_import_usage
 * (imports) and forky_chat_usage (messages), keyed by UTC month ('2026-10'), the same key the live
 * functions write. Limits come from TIER_LIMITS (src/scan/planTiers.ts). The server stays the
 * judge; this only reports.
 *
 * Daily caps (rebuild spec section 4) are NOT live: they need compliance and a database change
 * first. Nothing here works out or shows a daily number.
 */
import { scanTierFor } from '../scan/allowance';
import { TIER_LIMITS, tierForProfile, type PlanTier } from '../scan/planTiers';

export type UsageKind = 'scans' | 'imports' | 'forky';

export interface UsageCounts {
  scans: number;
  imports: number;
  forky: number;
}

export interface UsageLine {
  kind: UsageKind;
  used: number;
  /** null: no monthly limit applies to this account (admins are not capped on scans). */
  limit: number | null;
  remaining: number | null;
  /** 0..1 for a bar; 1 when the limit is reached or passed; 0 with no limit. */
  fraction: number;
}

/** A count from a usage row: a whole number from 0, or 0 when the row is missing or odd. */
export function cleanCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function usageLine(kind: UsageKind, usedRaw: number, limit: number | null): UsageLine {
  const used = cleanCount(usedRaw);
  if (limit === null) return { kind, used, limit: null, remaining: null, fraction: 0 };
  const cap = Math.max(0, Math.floor(limit));
  const remaining = Math.max(0, cap - used);
  const fraction = cap === 0 ? 1 : Math.min(1, used / cap);
  return { kind, used, limit: cap, remaining, fraction };
}

/**
 * The three lines for an account. Tier from profiles.plan + plan_tier. Admins are uncapped on
 * scans (pantry-vision); for imports and Ask Forky the functions keep their own admin rules, so
 * an admin sees the limits of the plan on the profile.
 */
export function usageLines(
  profile: { role?: string | null; plan?: string | null; planTier?: string | null },
  counts: UsageCounts,
): UsageLine[] {
  const tier: PlanTier = tierForProfile(profile.plan, profile.planTier);
  const limits = TIER_LIMITS[tier];
  const scanLimit = scanTierFor(profile) === 'admin' ? null : limits.scans;
  return [
    usageLine('scans', counts.scans, scanLimit),
    usageLine('imports', counts.imports, limits.imports),
    usageLine('forky', counts.forky, limits.forkyQuestions),
  ];
}
