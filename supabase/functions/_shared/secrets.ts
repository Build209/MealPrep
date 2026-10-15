// Shared-secret comparison for edge functions (no Deno or network imports, so checks can run it).

/**
 * Constant-time comparison so a secret check does not leak length or prefix by timing.
 * Trims both sides; an empty expected or provided value never matches.
 * Every admin/cron secret check in supabase/functions must use this, not === or !==
 * (supabase/scripts/secret-compare-check.ts enforces it).
 */
export function secretsMatch(expected: string, provided: string): boolean {
  const a = expected.trim();
  const b = provided.trim();
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
