/**
 * The import allowance shown on the Import button, worked out the way the live recipe-import
 * function does (importAllowance.ts): tier from profiles.plan + plan_tier (admins are never
 * capped), limit from planTiers.ts (`imports`), used count from this month's recipe_import_usage
 * row. Pure functions only (tests/recipe-import-allowance.test.ts).
 *
 * The server stays the judge: this only says what to expect. While anything is unknown the
 * button promises nothing ("Import").
 */
import { scanTierFor, type ScanTier } from '../../scan/allowance';
import { TIER_LIMITS, type PlanTier } from '../../scan/planTiers';

export type ImportTier = ScanTier;

/** Same tier rule as the function's loadImportTier (and pantry-vision's). */
export const importTierFor: (profile: { role?: string | null; plan?: string | null; planTier?: string | null }) => ImportTier =
  scanTierFor;

export type ImportAllowance =
  | { state: 'unknown' }
  | { state: 'uncapped' }
  | { state: 'capped'; tier: PlanTier; limit: number; used: number; remaining: number };

/** `used` is the month's `imports` count (0 with no row yet), or null when it could not be read. */
export function importAllowanceFor(tier: ImportTier | null, used: number | null): ImportAllowance {
  if (tier === null) return { state: 'unknown' };
  if (tier === 'admin') return { state: 'uncapped' };
  if (used === null || !Number.isFinite(used)) return { state: 'unknown' };
  const limit = TIER_LIMITS[tier].imports;
  const usedWhole = Math.max(0, Math.floor(used));
  return { state: 'capped', tier, limit, used: usedWhole, remaining: Math.max(0, limit - usedWhole) };
}

export const OUT_OF_IMPORTS = 'No imports left this month';

/** "2 imports left this month", "1 import left this month", "No imports left this month", or null. */
export function importsLeftText(allowance: ImportAllowance): string | null {
  if (allowance.state !== 'capped') return null;
  if (allowance.remaining <= 0) return OUT_OF_IMPORTS;
  return `${allowance.remaining} ${allowance.remaining === 1 ? 'import' : 'imports'} left this month`;
}

/** The Import button's label: "Import · 2 imports left this month", "No imports left this month" or "Import". */
export function importButtonText(allowance: ImportAllowance, base: string = 'Import'): string {
  const left = importsLeftText(allowance);
  if (!left) return base;
  if (allowance.state === 'capped' && allowance.remaining <= 0) return left;
  return `${base} · ${left}`;
}

export function isImportUsedUp(allowance: ImportAllowance): allowance is Extract<ImportAllowance, { state: 'capped' }> {
  return allowance.state === 'capped' && allowance.remaining <= 0;
}

/** A sentence under the button when the month's imports are gone. Plain words, no pressure. */
export function usedUpNote(allowance: ImportAllowance): string | null {
  if (!isImportUsedUp(allowance)) return null;
  return allowance.tier === 'free'
    ? `You've used your ${allowance.limit} free recipe imports this month. They start again on the 1st. A paid plan includes more.`
    : `You've used all ${allowance.limit} recipe imports this month. They start again on the 1st.`;
}

/** The used count implied by an import answer's usage, or null when it does not say. */
export function usedFromImportUsage(usage: { limit: number | null; remaining: number | null } | null | undefined): number | null {
  if (!usage || typeof usage.limit !== 'number' || typeof usage.remaining !== 'number') return null;
  return Math.max(0, usage.limit - usage.remaining);
}
