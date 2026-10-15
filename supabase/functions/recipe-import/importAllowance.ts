// Monthly recipe-import allowance per plan tier (free 2, Plus 5, Pro 10, Family 25; see
// ../_shared/planTiers.ts). An import is one recipe brought in from a link, pasted text, photos,
// screenshots or a video.
//
// One import is claimed BEFORE any model call, so an account cannot run past its allowance with
// parallel requests, and it is given back when no recipe came out of it (an error, "not a
// recipe") or when the answer came from the shared cache and cost nothing.
//
// Requires SQL migration 20261011180000_plan_tiers.sql. Until it is applied the counter cannot be
// reached and imports run uncounted, exactly as they did before this file existed.

import { tierForProfile, tierLimits, usageMonth, type PlanTier } from '../_shared/planTiers.ts';

export type ImportTier = 'admin' | PlanTier;

export type ImportClaim =
  /** Counted against the month. `remaining` is what is left after this one. */
  | { state: 'claimed'; tier: ImportTier; period: string; limit: number; remaining: number }
  | { state: 'used-up'; tier: ImportTier; limit: number }
  /** Admin, or the plan or counter could not be read: the import runs and is not counted. */
  | { state: 'uncounted'; tier: ImportTier | null };

function serviceConfig(): { url: string; key: string } | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, key } : null;
}

/** The account's tier, read with the service key. Null when it cannot be read. */
export async function loadImportTier(userId: string): Promise<ImportTier | null> {
  const config = serviceConfig();
  if (!config) return null;
  const readProfile = (columns: string) =>
    fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${columns}`, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    });
  try {
    let response = await readProfile('plan,role,plan_tier');
    // Before the plan_tiers migration the column is missing; a paying account is then Plus.
    if (response.status === 400) response = await readProfile('plan,role');
    if (!response.ok) {
      console.warn(`recipe-import: plan lookup http ${response.status}`);
      return null;
    }
    const rows = (await response.json()) as Array<{ plan?: string; role?: string; plan_tier?: string | null }>;
    const row = rows[0];
    if (!row) return null;
    if (row.role === 'admin') return 'admin';
    return tierForProfile(row.plan, row.plan_tier);
  } catch (error) {
    console.warn('recipe-import: plan lookup failed', error instanceof Error ? error.name : 'unknown');
    return null;
  }
}

async function callRpc(name: string, args: Record<string, unknown>): Promise<Response | null> {
  const config = serviceConfig();
  if (!config) return null;
  try {
    return await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch (error) {
    console.warn(`recipe-import: ${name} network error`, error instanceof Error ? error.name : 'unknown');
    return null;
  }
}

/** Takes one import from the month's allowance before any work is done. Never throws. */
export async function claimImport(userId: string, now: Date, overrideJson?: string | null): Promise<ImportClaim> {
  const tier = await loadImportTier(userId);
  if (tier == null || tier === 'admin') return { state: 'uncounted', tier };
  const limit = tierLimits(tier, overrideJson).imports;
  if (limit <= 0) return { state: 'used-up', tier, limit };
  const period = usageMonth(now);
  const response = await callRpc('claim_recipe_import', { p_user_id: userId, p_period: period, p_limit: limit });
  if (!response || !response.ok) {
    console.warn(`recipe-import: claim_recipe_import failed ${response ? `http ${response.status}` : 'no response'}`);
    return { state: 'uncounted', tier };
  }
  try {
    const remaining = (await response.json()) as unknown;
    if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return { state: 'uncounted', tier };
    return remaining < 0 ? { state: 'used-up', tier, limit } : { state: 'claimed', tier, period, limit, remaining };
  } catch {
    return { state: 'uncounted', tier };
  }
}

/** Gives a claimed import back. Never throws. */
export async function refundImport(userId: string, period: string): Promise<void> {
  const response = await callRpc('refund_recipe_import', { p_user_id: userId, p_period: period });
  if (!response || !response.ok) {
    console.warn(`recipe-import: refund_recipe_import failed ${response ? `http ${response.status}` : 'no response'}`);
  }
}

/**
 * Does this answer use up an import? Only a recipe that was actually extracted for this request:
 * not an error, not "that is not a recipe", and not an answer served from the shared cache.
 */
export function importCounts(status: number, body: unknown): boolean {
  if (status !== 200 || !body || typeof body !== 'object') return false;
  const json = body as { recipe?: unknown; cached?: unknown };
  return json.recipe != null && json.cached !== true;
}

/** What the app is told when the month's imports are used up. */
export function importLimitBody(tier: ImportTier, limit: number): Record<string, unknown> {
  const isPlus = tier !== 'free';
  const error =
    limit <= 0
      ? 'Recipe import is not available on your plan right now.'
      : isPlus
        ? `You have used all ${limit} recipe imports for this month. They reset on the 1st.`
        : `You have used your ${limit} free recipe imports for this month. They reset on the 1st. A paid plan includes more.`;
  return { error, code: 'IMPORT_LIMIT_REACHED', usage: { remaining: 0, limit, isPlus, tier } };
}
