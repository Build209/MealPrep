// Pantry shelf vision.
// Deploy: Actions -> "Deploy Supabase function" -> pantry-vision (deploys what is on main).
// It imports ../_shared/planTiers.ts, so it can no longer be pasted into the dashboard editor.
//
// Settings: leave "Verify JWT" ENABLED (default). Anonymous calls are rejected at the gateway;
// this handler reads the user id from the JWT for rate limiting.
//
// Secrets (Edge Functions → Secrets):
//   GEMINI_API_KEY = key from https://aistudio.google.com/apikey
// Optional secrets:
//   GEMINI_MODEL = e.g. gemini-3.8-flash (defaults below; keep in sync with mobile/config/geminiConfig.ts)
//   GEMINI_FALLBACK_MODELS = comma-separated backup model ids (optional)
//   GEMINI_REQUEST_TIMEOUT_MS = per-call timeout (default 50000)
//   GEMINI_THINKING_LEVEL = low | medium | high for Gemini 3 models (unset = Google's default, medium)
//   PANTRY_VERIFY_PASS = on to run a second "what did I miss" call per scan (doubles cost; default off)
//   PANTRY_LEGACY_SAMPLING = on to send temperature/topP to Gemini 3 models again (default off)
//   PANTRY_THOROUGH_SCAN = auto | off | always (default auto). A thorough scan checks each zoomed
//     crop in its own call and merges the results: about four extra calls for that photo.
//     "auto" does it only when the first pass already found PANTRY_THOROUGH_MIN_ITEMS or more.
//   PANTRY_THOROUGH_MIN_ITEMS = items in the first pass that mark a photo as busy (default 20)
//   PLAN_LIMITS_OVERRIDE = JSON that can only LOWER a tier's monthly limits in an emergency, for
//     example {"free":{"scans":0}}. See _shared/planTiers.ts. The older PANTRY_PLUS_MONTHLY_SCANS,
//     PANTRY_PLUS_MONTHLY_TAG_SCANS and PANTRY_FREE_TOTAL_SCANS secrets are no longer read.
//
// Monthly limits per tier (free, Plus, Pro, Family) are in _shared/planTiers.ts and are the numbers
// printed in the terms. Shelf, fridge and receipt photos share one pool; price tags are counted
// apart and are for paid tiers only. Every allowance, the free one included, starts again on the 1st.
//
// Requires SQL migrations 20261010040000_photo_scan_usage.sql (the counter) and
// 20261011180000_plan_tiers.sql (profiles.plan_tier). Without the counter, paying accounts scan
// without a cap (and a warning is logged) and free accounts get no free scans. Without plan_tier,
// every paying account is treated as Plus. Admin accounts are never capped.
//
// One log line per scan ("pantry-vision: scan ...") carries photo size, token counts and timing.
// It never contains the user id, the photo or the item names.

import { tierForProfile, tierLimits, usageMonth, type PlanTier } from '../_shared/planTiers.ts';

// BEGIN GEMINI_ORCHESTRATION (keep in sync with geminiOrchestration.ts — npm run test:pantry-vision-gemini)
/** @sync mobile/config/geminiConfig.ts */
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const DEFAULT_GEMINI_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
] as const;

/** Per upstream HTTP call (each Gemini generateContent). Override via `GEMINI_REQUEST_TIMEOUT_MS` secret. */
const DEFAULT_GEMINI_REQUEST_TIMEOUT_MS = 50_000;

/** @deprecated Use resolveGeminiRequestTimeoutMs — kept for tests importing the default cap. */
const GEMINI_REQUEST_TIMEOUT_MS = DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;

/** Base64 length above this is treated as a dense/large pantry photo for timeout memory. */
const LARGE_PANTRY_IMAGE_BASE64_LENGTH = 2_400_000;

function parseGeminiRequestTimeoutMs(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 8_000 || parsed > 120_000) {
    return DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;
  }
  return parsed;
}

function isLargePantryImageBase64(imageBase64: string): boolean {
  return imageBase64.length >= LARGE_PANTRY_IMAGE_BASE64_LENGTH;
}

/** Shared wall-clock budget for one pantry-vision HTTP request (under Supabase ~150s limit). */
const GEMINI_REQUEST_TOTAL_BUDGET_MS = 110_000;

/** Do not start a new Gemini call when less than this remains on the budget. */
const GEMINI_MIN_PER_CALL_TIMEOUT_MS = 2_500;

const MODEL_TIMEOUT_DEPRIORITIZE_MS = 5 * 60 * 1000;

const GEMINI_HTTP_RETRIES_PER_MODEL = 2;

function parseCommaSeparatedModels(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function buildGeminiModelCandidates(
  primaryFromEnv: string | undefined,
  fallbacksFromEnv: string | undefined,
): string[] {
  const primary =
    (primaryFromEnv ?? DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const fromSecret = parseCommaSeparatedModels(fallbacksFromEnv);
  const ordered = [primary, ...fromSecret, ...DEFAULT_GEMINI_FALLBACK_MODELS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const model of ordered) {
    if (seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
}

function deprioritizeRecentlyTimedOutModels(
  candidates: string[],
  timedOutAt: ReadonlyMap<string, number>,
  nowMs: number,
  ttlMs: number = MODEL_TIMEOUT_DEPRIORITIZE_MS,
  skipLargeImageTimeouts: ReadonlyMap<string, number> | null = null,
  imageIsLarge: boolean = false,
): string[] {
  let pool = candidates;
  if (imageIsLarge && skipLargeImageTimeouts && skipLargeImageTimeouts.size > 0) {
    const filtered = candidates.filter((model) => {
      const at = skipLargeImageTimeouts.get(model);
      return at == null || nowMs - at >= ttlMs;
    });
    if (filtered.length > 0) pool = filtered;
  }

  const fresh: string[] = [];
  const deprioritized: string[] = [];
  for (const model of pool) {
    const at = timedOutAt.get(model);
    if (at != null && nowMs - at < ttlMs) {
      deprioritized.push(model);
    } else {
      fresh.push(model);
    }
  }
  return [...fresh, ...deprioritized];
}

class ModelTimeoutMemory {
  private readonly timedOutAt = new Map<string, number>();
  private readonly timedOutOnLargeImageAt = new Map<string, number>();

  record(model: string, nowMs: number = Date.now(), imageWasLarge: boolean = false): void {
    this.timedOutAt.set(model, nowMs);
    if (imageWasLarge) {
      this.timedOutOnLargeImageAt.set(model, nowMs);
    }
  }

  orderCandidates(
    candidates: string[],
    nowMs: number = Date.now(),
    imageIsLarge: boolean = false,
  ): string[] {
    return deprioritizeRecentlyTimedOutModels(
      candidates,
      this.timedOutAt,
      nowMs,
      MODEL_TIMEOUT_DEPRIORITIZE_MS,
      this.timedOutOnLargeImageAt,
      imageIsLarge,
    );
  }
}

class RequestTimeBudget {
  private readonly startedAtMs: number;

  constructor(
    private readonly totalMs: number,
    private readonly nowFn: () => number = Date.now,
  ) {
    this.startedAtMs = nowFn();
  }

  elapsedMs(): number {
    return this.nowFn() - this.startedAtMs;
  }

  remainingMs(): number {
    return Math.max(0, this.totalMs - this.elapsedMs());
  }

  isExhausted(): boolean {
    return this.remainingMs() < GEMINI_MIN_PER_CALL_TIMEOUT_MS;
  }

  /** Milliseconds for the next AbortSignal.timeout, or null if the budget is too low. */
  perCallTimeoutMs(capMs: number = GEMINI_REQUEST_TIMEOUT_MS): number | null {
    const remaining = this.remainingMs();
    if (remaining < GEMINI_MIN_PER_CALL_TIMEOUT_MS) return null;
    return Math.min(capMs, remaining);
  }
}

type GeminiRetryableErrorKind = 'timeout' | 'http';

function shouldRetrySameModelAfterError(
  error: { kind: GeminiRetryableErrorKind; retryable?: boolean },
  httpRetriesUsed: number,
  maxHttpRetries: number = GEMINI_HTTP_RETRIES_PER_MODEL,
): boolean {
  if (error.kind === 'timeout') return false;
  if (error.kind === 'http' && error.retryable) {
    return httpRetriesUsed < maxHttpRetries - 1;
  }
  return false;
}

function orderModelsForAttempt(
  primaryFromEnv: string | undefined,
  fallbacksFromEnv: string | undefined,
  timeoutMemory: ModelTimeoutMemory,
  nowMs: number = Date.now(),
  imageIsLarge: boolean = false,
): string[] {
  const base = buildGeminiModelCandidates(primaryFromEnv, fallbacksFromEnv);
  return timeoutMemory.orderCandidates(base, nowMs, imageIsLarge);
}
// END GEMINI_ORCHESTRATION

function perCallGeminiTimeoutMs(): number {
  return parseGeminiRequestTimeoutMs(Deno.env.get('GEMINI_REQUEST_TIMEOUT_MS') ?? undefined);
}

// BEGIN PANTRY_MERGE (keep in sync with pantryItemMerge.ts — npm run test:pantry-vision-merge)
type PantryMergeRow = {
  name: string;
  quantity: number;
  unit: string;
  confidence: number;
};

type PantryMergeIdentity = {
  identityKey: (name: string) => string;
  rowsMatch: (a: string, b: string) => boolean;
};

function stableSortByName<T extends { name: string }>(
  items: T[],
  identityKey: (name: string) => string,
): T[] {
  return [...items].sort((a, b) => identityKey(a.name).localeCompare(identityKey(b.name)));
}

function pickBetterPantryName(a: string, b: string): string {
  const lenA = a.trim().length;
  const lenB = b.trim().length;
  if (lenA !== lenB) return lenA > lenB ? a : b;
  return a.localeCompare(b) <= 0 ? a : b;
}

function mergePantryRowPair<T extends PantryMergeRow>(existing: T, incoming: T): T {
  const sameUnit = existing.unit.toLowerCase() === incoming.unit.toLowerCase();
  const quantity = sameUnit
    ? Math.max(existing.quantity, incoming.quantity)
    : Math.max(existing.quantity, incoming.quantity);
  return {
    ...existing,
    name: pickBetterPantryName(existing.name, incoming.name),
    quantity,
    unit: existing.unit || incoming.unit,
    confidence: Math.max(existing.confidence, incoming.confidence),
  };
}

function dedupePantryRows<T extends PantryMergeRow>(items: T[], identity: PantryMergeIdentity): T[] {
  const sorted = stableSortByName(items, identity.identityKey);
  const merged: T[] = [];

  for (const row of sorted) {
    const key = identity.identityKey(row.name);
    let matchIndex = -1;
    for (let i = 0; i < merged.length; i += 1) {
      const other = merged[i];
      const otherKey = identity.identityKey(other.name);
      if (key === otherKey || identity.rowsMatch(row.name, other.name)) {
        matchIndex = i;
        break;
      }
    }
    if (matchIndex >= 0) {
      merged[matchIndex] = mergePantryRowPair(merged[matchIndex], row);
    } else {
      merged.push(row);
    }
  }
  return stableSortByName(merged, identity.identityKey);
}

function mergePantryPasses<T extends PantryMergeRow>(
  passA: T[],
  passB: T[],
  identity: PantryMergeIdentity,
): T[] {
  return dedupePantryRows([...passA, ...passB], identity);
}

function pantryRowsSeemCompleteForSinglePass(
  items: PantryMergeRow[],
  minItems: number,
  minAvgConfidence: number,
): boolean {
  if (items.length < minItems) return false;
  const avg = items.reduce((sum, row) => sum + row.confidence, 0) / items.length;
  return avg >= minAvgConfidence;
}

function shouldRunPantryVerifySecondPass(_budgetExhausted: boolean): boolean {
  return false;
}

const EDGE_PANTRY_MERGE_IDENTITY: PantryMergeIdentity = {
  identityKey: normalizeNameKey,
  rowsMatch: () => false,
};
// END PANTRY_MERGE

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_RETRY_BACKOFF_MS = 450;
const GEMINI_RETRYABLE_HTTP_STATUSES = new Set([429, 500, 503]);
const geminiModelTimeoutMemory = new ModelTimeoutMemory();
const PANTRY_VISION_CACHE_VERSION = 'v9';
const PANTRY_VISION_SINGLE_PASS_MIN_ITEMS = 8;
const PANTRY_VISION_SINGLE_PASS_MIN_AVG_CONFIDENCE = 0.72;
const PANTRY_MAX_ITEMS = 120;
const GEMINI_DETERMINISTIC_SEED = 42;
const GEMINI_MAX_OUTPUT_TOKENS = 16_384;
const GEMINI_MAX_OUTPUT_TOKENS_RETRY = 24_576;

const SCAN_RESULT_CACHE_TTL_MS = 30 * 60 * 1000;
const SCAN_RESULT_CACHE_MAX = 200;
const scanResultCache = new Map<string, { at: number; items: DetectedPantryItem[]; model: string }>();

function isModelNotFoundOrRetired(status: number, detail: string): boolean {
  if (status !== 404) return false;
  const lower = detail.toLowerCase();
  return (
    lower.includes('not found') ||
    lower.includes('not_found') ||
    lower.includes('retired') ||
    lower.includes('no longer') ||
    lower.includes('does not exist')
  );
}

function isRetryableGeminiHttpFailure(status: number, detail: string): boolean {
  return GEMINI_RETRYABLE_HTTP_STATUSES.has(status) || isModelNotFoundOrRetired(status, detail);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Zoomed crops of the same photo sent with it (see PHOTO_SCAN.detailTiles on the client). */
const MAX_DETAIL_TILES = 4;
const MAX_DETAIL_TILE_BYTES = 1_500_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const PANTRY_CATEGORIES = [
  'spices',
  'meats',
  'produce',
  'dairy',
  'dry_goods',
  'cookware',
  'frozen',
  'condiments',
] as const;

const PANTRY_STORAGE = ['pantry', 'fridge', 'spice_rack'] as const;

const PRICE_TAG_JSON_SCHEMA = {
  type: 'object',
  properties: {
    itemName: { type: 'string' },
    price: { type: 'number' },
    sizeUnit: { type: 'string' },
    saleValidUntil: { type: ['string', 'null'] },
  },
  required: ['itemName', 'price'],
} as const;

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          category: { type: 'string', enum: [...PANTRY_CATEGORIES] },
          storage: { type: 'string', enum: [...PANTRY_STORAGE] },
          confidence: { type: 'number' },
        },
        required: ['name', 'quantity', 'unit', 'category', 'storage', 'confidence'],
      },
    },
  },
  required: ['items'],
} as const;

const userHits = new Map<string, { count: number; windowStart: number }>();
const USER_WINDOW_MS = 60_000;
const USER_MAX_PER_WINDOW = 12;

type DetectedPantryItem = {
  name: string;
  quantity: number;
  unit: string;
  category: (typeof PANTRY_CATEGORIES)[number];
  storage: (typeof PANTRY_STORAGE)[number];
  confidence: number;
};

type GeminiModelAttemptDebug = {
  model: string;
  ok: boolean;
  status?: number;
  message?: string;
};

type ScanTier = 'admin' | PlanTier;

/** The account's plan, read with the service key. Null when it cannot be read (treated as no access). */
async function loadScanTier(userId: string): Promise<ScanTier | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('pantry-vision: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for plan check');
    return null;
  }

  const readProfile = (columns: string) =>
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${columns}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
  let response: Response;
  try {
    response = await readProfile('plan,role,plan_tier');
    // Deployed before the plan_tiers migration: the column is not there yet. Read without it;
    // a paying account is then treated as Plus.
    if (response.status === 400) response = await readProfile('plan,role');
  } catch (error) {
    console.warn('pantry-vision: plan lookup network error', error);
    return null;
  }

  if (!response.ok) {
    console.warn(`pantry-vision: plan lookup http ${response.status}`);
    return null;
  }

  try {
    const rows = (await response.json()) as Array<{ plan?: string; role?: string; plan_tier?: string | null }>;
    const row = rows[0];
    if (!row) return null;
    if (row.role === 'admin') return 'admin';
    return tierForProfile(row.plan, row.plan_tier);
  } catch (error) {
    console.warn('pantry-vision: plan lookup parse error', error);
    return null;
  }
}

// --- Scan allowance (a monthly limit for every tier, the free one included) ---

type ScanAllowance = {
  /** Row key in photo_scan_usage, or null when this scan is not counted (admin). */
  period: string | null;
  limit: number;
};

/**
 * Which bucket a scan counts against, and how big the bucket is.
 * Shelf, fridge and receipt photos share the month's row ('2026-10'); price tags have their own
 * ('2026-10|tag'). A free account that upgrades mid-month keeps the scans it already used, so
 * switching plans never refills the month.
 */
function scanAllowanceFor(
  tier: ScanTier,
  action: VisionAction,
  now: Date,
  overrideJson?: string,
): ScanAllowance {
  if (tier === 'admin') return { period: null, limit: Number.POSITIVE_INFINITY };
  const limits = tierLimits(tier, overrideJson);
  const month = usageMonth(now);
  return action === 'price-tag'
    ? { period: `${month}|tag`, limit: limits.priceTagScans }
    : { period: month, limit: limits.scans };
}

async function callScanRpc(name: string, args: Record<string, unknown>): Promise<Response | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  try {
    return await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch (error) {
    console.warn(`pantry-vision: ${name} network error`, error);
    return null;
  }
}

type ScanClaim =
  | { state: 'claimed'; remaining: number }
  | { state: 'used-up' }
  /** The counter could not be reached (migration not applied, database error). */
  | { state: 'unavailable' };

/** Takes one scan from the allowance before the model is called. */
async function claimScan(userId: string, allowance: ScanAllowance): Promise<ScanClaim> {
  if (allowance.period == null) return { state: 'claimed', remaining: Number.POSITIVE_INFINITY };
  if (allowance.limit <= 0) return { state: 'used-up' };
  const response = await callScanRpc('claim_photo_scan', {
    p_user_id: userId,
    p_period: allowance.period,
    p_limit: allowance.limit,
  });
  if (!response || !response.ok) {
    console.warn(`pantry-vision: claim_photo_scan failed ${response ? `http ${response.status}` : 'no response'}`);
    return { state: 'unavailable' };
  }
  try {
    const remaining = (await response.json()) as unknown;
    if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return { state: 'unavailable' };
    return remaining < 0 ? { state: 'used-up' } : { state: 'claimed', remaining };
  } catch {
    return { state: 'unavailable' };
  }
}

/** Records tokens after a scan, or gives the scan back when the model call failed. Never throws. */
async function settleScan(
  userId: string,
  period: string | null,
  usage: { inputTokens: number; outputTokens: number },
  refund: boolean,
): Promise<void> {
  if (period == null) return;
  const response = await callScanRpc('settle_photo_scan', {
    p_user_id: userId,
    p_period: period,
    p_input_tokens: Math.round(usage.inputTokens),
    p_output_tokens: Math.round(usage.outputTokens),
    p_refund: refund,
  });
  if (!response || !response.ok) {
    console.warn(`pantry-vision: settle_photo_scan failed ${response ? `http ${response.status}` : 'no response'}`);
  }
}

/** What a repeat of the same request is given: the answer the first request produced. */
type SharedScanResult = { items: DetectedPantryItem[]; model: string; usage?: unknown };
type ScanRequestState =
  | { state: 'started' }
  | { state: 'running' }
  | { state: 'done'; result: SharedScanResult }
  /** The table could not be reached (migration not applied, database error): scan without it. */
  | { state: 'untracked' };

/** A request still marked running after this long was abandoned (worker stopped); the next one takes over. */
const SCAN_REQUEST_STALE_SECONDS = 150;
/** How long a finished answer is handed to a repeat of the same request. */
const SCAN_REQUEST_REUSE_SECONDS = 600;
const SCAN_REQUEST_POLL_MS = 1500;
/** A repeat waits at most this long for the first request, then reports busy. */
const SCAN_REQUEST_MAX_WAIT_MS = 110_000;

/**
 * The same request can arrive twice: a phone browser resends it when its connection drops while
 * the scan is still running. Every request runs in its own worker, so the two can only find each
 * other in the database. The first takes the row; a repeat is told to wait, then given the answer.
 */
async function beginScanRequest(userId: string, key: string): Promise<ScanRequestState> {
  const response = await callScanRpc('begin_photo_scan_request', {
    p_user_id: userId,
    p_key: key,
    p_stale_seconds: SCAN_REQUEST_STALE_SECONDS,
    p_reuse_seconds: SCAN_REQUEST_REUSE_SECONDS,
  });
  if (!response || !response.ok) {
    console.warn(`pantry-vision: begin_photo_scan_request failed ${response ? `http ${response.status}` : 'no response'}`);
    return { state: 'untracked' };
  }
  try {
    const body = (await response.json()) as { state?: unknown; result?: unknown } | null;
    if (body?.state === 'running') return { state: 'running' };
    if (body?.state === 'done') {
      const result = body.result as SharedScanResult | null;
      if (result && Array.isArray(result.items) && typeof result.model === 'string') {
        return { state: 'done', result };
      }
      return { state: 'untracked' };
    }
    if (body?.state === 'started') return { state: 'started' };
    return { state: 'untracked' };
  } catch {
    return { state: 'untracked' };
  }
}

/** Stores the answer for a repeat, or (null) clears the row after a failed or refused scan. Never throws. */
async function finishScanRequest(userId: string, key: string, result: SharedScanResult | null): Promise<void> {
  const response = await callScanRpc('finish_photo_scan_request', {
    p_user_id: userId,
    p_key: key,
    p_result: result,
  });
  if (!response || !response.ok) {
    console.warn(`pantry-vision: finish_photo_scan_request failed ${response ? `http ${response.status}` : 'no response'}`);
  }
}

function scanLimitResponse(tier: ScanTier, allowance: ScanAllowance, action: VisionAction): Response {
  if (tier === 'free') {
    // PLAN_REQUIRED makes the app show the paid plans. Price tags are never part of the free plan.
    const error =
      allowance.limit > 0 && action !== 'price-tag'
        ? `You have used your ${allowance.limit} free scans for this month. They reset on the 1st. A paid plan includes more.`
        : action === 'price-tag'
          ? 'Price-tag scanning is part of the paid plans.'
          : 'Photo scanning is part of the paid plans.';
    return jsonResponse(
      { error, code: 'PLAN_REQUIRED', usage: { remaining: 0, limit: allowance.limit, isPlus: false, tier } },
      403,
    );
  }
  const what = action === 'price-tag' ? 'price-tag scans' : 'photo scans';
  return jsonResponse(
    {
      error: `You have used all ${allowance.limit} ${what} for this month. They reset on the 1st.`,
      code: 'SCAN_LIMIT_REACHED',
      usage: { remaining: 0, limit: allowance.limit, isPlus: true, tier },
    },
    429,
  );
}

/**
 * What the app is told about the allowance after a scan. Admin scans are not capped.
 * `isPlus` means "on a paid tier" (kept for app versions that only know that flag).
 */
function usageForResponse(tier: ScanTier, allowance: ScanAllowance, remaining: number) {
  const capped = allowance.period != null && Number.isFinite(remaining);
  return {
    isPlus: tier !== 'free',
    tier,
    limit: capped ? allowance.limit : null,
    remaining: capped ? remaining : null,
  };
}

function checkUserRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = userHits.get(userId);
  if (!bucket || now - bucket.windowStart > USER_WINDOW_MS) {
    userHits.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= USER_MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

/** With Verify JWT enabled, only authenticated requests reach this handler. */
function userIdFromJwt(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { sub?: string };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function normalizeMime(value: string | null | undefined): string {
  const mime = (value ?? 'image/jpeg').toLowerCase().split(';')[0].trim();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

function parseScanLocationHint(raw: unknown): (typeof PANTRY_STORAGE)[number] {
  if (typeof raw !== 'string') return 'pantry';
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (trimmed === 'spice_rack' || trimmed === 'spice-rack' || trimmed === 'spicerack') return 'spice_rack';
  if ((PANTRY_STORAGE as readonly string[]).includes(trimmed)) {
    return trimmed as (typeof PANTRY_STORAGE)[number];
  }
  return 'pantry';
}

type VisionAction = 'pantry' | 'price-tag' | 'receipt';

function parseVisionAction(raw: unknown): VisionAction {
  return raw === 'price-tag' || raw === 'receipt' ? raw : 'pantry';
}

type DetailTile = {
  mimeType: string;
  base64: string;
  byteLength: number;
  /** "top left", "bottom right", ... Free text from the client is never passed to the model. */
  position: string;
};

type ImageFromRequest = {
  bytes: Uint8Array;
  mimeType: string;
  scanLocation: (typeof PANTRY_STORAGE)[number];
  action: VisionAction;
  imageHash?: string;
  tiles: DetailTile[];
};

const TILE_POSITION_WORDS = new Set(['top', 'middle', 'bottom', 'left', 'centre', 'center', 'right']);

/** Keeps only the fixed position words, so nothing a client sends can become an instruction. */
function sanitizeTilePosition(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => TILE_POSITION_WORDS.has(word))
    .slice(0, 2)
    .join(' ');
}

/**
 * Optional zoomed crops. Anything malformed or oversized is dropped rather than failing the
 * scan: the main photo alone still gives a result.
 */
function parseDetailTiles(raw: unknown): DetailTile[] {
  if (!Array.isArray(raw)) return [];
  const tiles: DetailTile[] = [];
  for (const entry of raw.slice(0, MAX_DETAIL_TILES)) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const rawBase64 = typeof row.imageBase64 === 'string' ? row.imageBase64.trim() : '';
    if (!rawBase64) continue;
    const base64 = rawBase64.includes(',') ? (rawBase64.split(',').pop() ?? '') : rawBase64;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) continue;
    const mimeType = normalizeMime(typeof row.mimeType === 'string' ? row.mimeType : undefined);
    if (!ALLOWED_MIME.has(mimeType)) continue;
    const byteLength = estimateBase64Bytes(base64);
    if (byteLength <= 0 || byteLength > MAX_DETAIL_TILE_BYTES) continue;
    tiles.push({ mimeType, base64, byteLength, position: sanitizeTilePosition(row.position) });
  }
  return tiles;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readImageFromRequest(req: Request): Promise<ImageFromRequest | Response> {
  const contentType = req.headers.get('Content-Type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('image');
    if (!(file instanceof File)) {
      return jsonResponse({ error: 'Missing image file field "image"', code: 'BAD_REQUEST' }, 400);
    }
    const mimeType = normalizeMime(file.type);
    if (!ALLOWED_MIME.has(mimeType)) {
      return jsonResponse({ error: 'Unsupported image type. Use JPEG, PNG, or WebP.', code: 'BAD_REQUEST' }, 400);
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return jsonResponse({ error: 'Image too large. Resize on the client and try again.', code: 'PAYLOAD_TOO_LARGE' }, 413);
    }
    const locationField = form.get('location');
    const scanLocation = parseScanLocationHint(
      typeof locationField === 'string' ? locationField : undefined,
    );
    const actionField = form.get('action');
    const action: VisionAction = parseVisionAction(actionField);
    const hashField = form.get('imageHash');
    const imageHash = typeof hashField === 'string' ? hashField.trim() : undefined;
    return { bytes: buffer, mimeType, scanLocation, action, imageHash, tiles: [] };
  }

  let body: {
    imageBase64?: string;
    mimeType?: string;
    location?: string;
    action?: string;
    imageHash?: string;
    tiles?: unknown;
  };
  try {
    body = (await req.json()) as {
      imageBase64?: string;
      mimeType?: string;
      location?: string;
      action?: string;
      imageHash?: string;
      tiles?: unknown;
    };
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }

  const scanLocation = parseScanLocationHint(body.location);
  const action: VisionAction = parseVisionAction(body.action);
  const imageHash = typeof body.imageHash === 'string' ? body.imageHash.trim() : undefined;

  const raw = body.imageBase64?.trim() ?? '';
  if (!raw) {
    return jsonResponse({ error: 'imageBase64 is required', code: 'BAD_REQUEST' }, 400);
  }
  const mimeType = normalizeMime(body.mimeType);
  if (!ALLOWED_MIME.has(mimeType)) {
    return jsonResponse({ error: 'Unsupported mimeType', code: 'BAD_REQUEST' }, 400);
  }

  const base64 = raw.includes(',') ? (raw.split(',').pop() ?? '') : raw;
  if (estimateBase64Bytes(base64) > MAX_IMAGE_BYTES) {
    return jsonResponse({ error: 'Image too large. Resize on the client and try again.', code: 'PAYLOAD_TOO_LARGE' }, 413);
  }

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { bytes, mimeType, scanLocation, action, imageHash, tiles: action === 'price-tag' ? [] : parseDetailTiles(body.tiles) };
  } catch {
    return jsonResponse({ error: 'Invalid base64 image data', code: 'BAD_REQUEST' }, 400);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Generic recipe ingredient label (lowercase, no brands). */
function formatGenericIngredientName(raw: string): string {
  return normalizeNameKey(raw);
}

function stableSortItems(items: DetectedPantryItem[]): DetectedPantryItem[] {
  return [...items].sort((a, b) => normalizeNameKey(a.name).localeCompare(normalizeNameKey(b.name)));
}

function sanitizeItems(raw: unknown): DetectedPantryItem[] {
  if (!raw || typeof raw !== 'object') return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const out: DetectedPantryItem[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    const quantity = Number(row.quantity);
    const unit = typeof row.unit === 'string' ? row.unit.trim() || 'each' : 'each';
    const categoryRaw = typeof row.category === 'string' ? row.category : 'dry_goods';
    const category = (PANTRY_CATEGORIES as readonly string[]).includes(categoryRaw)
      ? (categoryRaw as (typeof PANTRY_CATEGORIES)[number])
      : 'dry_goods';
    const confidence = Number(row.confidence);
    const storageRaw = typeof row.storage === 'string' ? row.storage.trim().toLowerCase() : 'pantry';
    const storage = (PANTRY_STORAGE as readonly string[]).includes(storageRaw)
      ? (storageRaw as (typeof PANTRY_STORAGE)[number])
      : 'pantry';
    out.push({
      name: formatGenericIngredientName(name).slice(0, 120),
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.min(quantity, 9999) : 1,
      unit: unit.slice(0, 32),
      category,
      storage,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    });
  }
  return stableSortItems(out).slice(0, PANTRY_MAX_ITEMS);
}

function dedupeItems(items: DetectedPantryItem[]): DetectedPantryItem[] {
  return dedupePantryRows(items, EDGE_PANTRY_MERGE_IDENTITY);
}

function mergeItemPasses(passA: DetectedPantryItem[], passB: DetectedPantryItem[]): DetectedPantryItem[] {
  return mergePantryPasses(passA, passB, EDGE_PANTRY_MERGE_IDENTITY);
}

function getCachedScan(cacheKey: string): { items: DetectedPantryItem[]; model: string } | null {
  const entry = scanResultCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.at > SCAN_RESULT_CACHE_TTL_MS) {
    scanResultCache.delete(cacheKey);
    return null;
  }
  return { items: entry.items, model: entry.model };
}

function setCachedScan(cacheKey: string, items: DetectedPantryItem[], model: string): void {
  if (scanResultCache.size >= SCAN_RESULT_CACHE_MAX) {
    const oldest = [...scanResultCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) scanResultCache.delete(oldest[0]);
  }
  scanResultCache.set(cacheKey, { at: Date.now(), items, model });
}

function scanLocationPromptHint(scanLocation: (typeof PANTRY_STORAGE)[number]): string {
  switch (scanLocation) {
    case 'fridge':
      return (
        'The user is scanning their refrigerator. Expect chilled items: dairy, eggs, fresh meat and fish, produce, ' +
        'opened condiments, and leftovers. Still assign correct storage if something shelf-stable appears.'
      );
    case 'spice_rack':
      return (
        'The user is scanning their spice rack. Expect dried spices, dried herbs, and seasonings. ' +
        'Still assign correct storage if a non-spice item appears.'
      );
    default:
      return (
        'The user is scanning pantry shelves. Expect dry goods, canned goods, snacks, cereal, baking supplies, ' +
        'shelf-stable sauces, bread, and similar room-temperature items. Still assign correct storage for perishables if visible.'
      );
  }
}

type GeminiAttemptFailure = {
  kind: 'http';
  status: number;
  detail: string;
  retryable: boolean;
};

type GeminiAttemptTimeout = {
  kind: 'timeout';
  retryable: true;
};

type GeminiAttemptError = GeminiAttemptFailure | GeminiAttemptTimeout;

function priceTagPrompt(): string {
  return (
    'You read grocery store shelf tags and price labels from a photo. ' +
    'Extract the product name, the shelf price in US dollars (number only, no $), the package size or unit (e.g. "16 oz", "1 gal", "each"), ' +
    'and an optional sale end date in YYYY-MM-DD if a sale or "valid through" date is visible. ' +
    'If no sale date is shown, set saleValidUntil to null. Do not invent prices that are not visible. Return JSON only.'
  );
}

type SanitizedPriceTag = {
  itemName: string;
  price: number;
  sizeUnit?: string;
  saleValidUntil?: string | null;
};

function sanitizePriceTag(raw: unknown): SanitizedPriceTag | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const itemName = typeof row.itemName === 'string' ? row.itemName.trim() : '';
  const price = Number(row.price);
  if (!itemName || !Number.isFinite(price) || price < 0) return null;
  const sizeUnit =
    typeof row.sizeUnit === 'string' && row.sizeUnit.trim() ? row.sizeUnit.trim().slice(0, 48) : undefined;
  let saleValidUntil: string | null | undefined = undefined;
  if (row.saleValidUntil === null) saleValidUntil = null;
  else if (typeof row.saleValidUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.saleValidUntil.trim())) {
    saleValidUntil = row.saleValidUntil.trim();
  }
  return {
    itemName: itemName.slice(0, 120),
    price: Math.round(price * 100) / 100,
    sizeUnit,
    saleValidUntil,
  };
}

function geminiEnumeratePrompt(
  scanLocation: (typeof PANTRY_STORAGE)[number],
  tileCount: number = 0,
  /** Thorough scan: this call covers one zoomed crop only. Value is the crop's position, or '' if unknown. */
  cropFocus: string | null = null,
): string {
  const photos =
    cropFocus != null
      ? 'You are given 2 images of ONE photo: first the full photo for context, then a zoomed crop of ' +
        (cropFocus ? `its ${cropFocus} part` : 'one part of it') +
        '. List EVERY food product visible in the ZOOMED CROP, including products cut off at its edge. ' +
        'Do not list products that only show in the full photo outside the crop; other crops are checked separately.\n'
      : tileCount > 0
        ? `You are given ${tileCount + 1} images of ONE photo: first the full photo, then ${tileCount} zoomed crops of the same photo ` +
          'that overlap each other. Use the full photo to see the layout and the crops to read labels. ' +
          'A product that shows in more than one image is still ONE product: list it once.\n'
        : '';
  return (
    'You inventory edible kitchen products from a photo for a home recipe app. Be complete: list EVERY food product you can see. ' +
    'Do NOT summarize, sample, or stop early.\n' +
    photos +
    scanLocationPromptHint(scanLocation) +
    '\nHow to work:\n' +
    '- Go shelf by shelf, top to bottom; on each shelf go left to right. Then check lower shelves, back rows, and items partly hidden behind others.\n' +
    '- Before you answer, count the products you can see and make sure your list has about that many entries.\n' +
    'What to list:\n' +
    '- One JSON object per distinct product. If three identical cans are visible, quantity 3 and unit "can".\n' +
    '- Identify each product from its front label, and from its packaging, shape and colour when the label is small or partly hidden.\n' +
    '- If you can tell what kind of food it is but are not sure of the exact product, STILL list it with your best specific name and a lower confidence (0.3 to 0.6). The user reviews the list and removes mistakes; a missing item is worse than an uncertain one.\n' +
    '- Leave something out only when you cannot tell what food it is at all. Never list a product that is not in the photo.\n' +
    '- Skip non-food (pet food, cleaning supplies, napkins, appliances, empty jars, bags, tools).\n' +
    '- Ignore ingredient lists, nutrition panels, and barcodes.\n' +
    'How to name:\n' +
    '- name: generic recipe ingredient only, lowercase, singular when natural (egg, cheddar cheese, milk). Never put store or product brand names in name (no Kraft, WinCo, Goldfish, etc.).\n' +
    '- Be specific when it matters: honey peanut butter not almond butter; pancake syrup not maple syrup; powdered drink mix not juice brand; bread not bread mix; cheddar cheese crackers not just crackers.\n' +
    '- quantity is a rough count when visible; default 1. Use realistic units (oz, lb, each, bottle, jar, can, box, bag).\n' +
    '- confidence 0-1: 0.85 or more when the label is clearly readable, lower when you are inferring.\n' +
    'Examples: {"name":"black olives","quantity":1,"unit":"can","category":"dry_goods","storage":"pantry","confidence":0.9}\n' +
    '{"name":"cheddar cheese","quantity":1,"unit":"block","category":"dairy","storage":"fridge","confidence":0.88}\n' +
    '{"name":"eggs","quantity":12,"unit":"each","category":"dairy","storage":"fridge","confidence":0.9}\n' +
    '{"name":"tomato soup","quantity":2,"unit":"can","category":"dry_goods","storage":"pantry","confidence":0.5}\n' +
    'Return JSON only matching the schema.'
  );
}

function geminiVerifyPrompt(
  scanLocation: (typeof PANTRY_STORAGE)[number],
  passOneNames: string[],
  tileCount: number = 0,
): string {
  const list = passOneNames.slice(0, 80).map((n) => `- ${n}`).join('\n');
  const photos =
    tileCount > 0
      ? `You are given ${tileCount + 1} images of ONE photo: the full photo, then ${tileCount} overlapping zoomed crops of it.\n`
      : '';
  return (
    'You verify a pantry inventory from the same photo.\n' +
    photos +
    scanLocationPromptHint(scanLocation) +
    '\nFirst pass already found:\n' +
    list +
    '\nLook at the image again. Return ONLY additional visible food products missing from that list.\n' +
    'Same rules as before: generic recipe names with no brand names, check lower shelves and back rows, no non-food, ' +
    'and list a product you can only partly identify with a lower confidence rather than leaving it out. Never list a product that is not in the photo.\n' +
    'If nothing new is visible, return {"items":[]}.\n' +
    'Do NOT repeat first-pass items. Do NOT re-list the full inventory. JSON only.'
  );
}

/**
 * Grocery receipt: printed lines instead of labels. The answer uses the same item shape as a
 * shelf scan, so the app's review list works unchanged. The model is told to return food
 * items only; nothing else on the receipt (card digits, loyalty number, cashier) is asked for.
 */
function receiptPrompt(tileCount: number = 0): string {
  const photos =
    tileCount > 0
      ? `You are given ${tileCount + 1} images of ONE receipt: first the whole receipt, then ${tileCount} zoomed strips of it from top to bottom ` +
        'that overlap each other. Use the strips to read the print. A line that shows in two strips is still ONE line: count it once.\n'
      : '';
  return (
    'You read a grocery store receipt from a photo for a home pantry app. List every FOOD or DRINK product that was bought. ' +
    'Be complete: go line by line from the top of the receipt to the bottom and do not stop early.\n' +
    photos +
    'What to list:\n' +
    '- One JSON object per product. If the same product is on more than one line, or a line shows a count (2 @ 1.99, QTY 3, 3 x), add them up into one entry.\n' +
    '- Receipts abbreviate. Expand each line to a plain generic ingredient name, lowercase, singular when natural, with no brand or store names ' +
    '(GV WHL MLK 1GL is whole milk; BNLS SKNLS CHKN BRST is chicken breast; ORG BABY SPIN is baby spinach).\n' +
    '- If a line is clearly food but you are not sure what, STILL list your best specific guess with a lower confidence (0.3 to 0.6). ' +
    'The user reviews the list and removes mistakes.\n' +
    '- quantity and unit: use the weight for items sold by weight (1.25 lb), the package size when it is printed (1 gallon), otherwise the count with unit "each".\n' +
    '- category and storage: where the product would be kept at home (pantry, fridge or spice_rack).\n' +
    '- confidence 0-1: 0.85 or more when the line is clear, lower when you are expanding a hard abbreviation.\n' +
    'What to leave out:\n' +
    '- Anything that is not food or drink: cleaning supplies, paper goods, pet food, medicine, cosmetics, gift cards, clothing.\n' +
    '- Lines that are not products: bag fees, bottle deposits (CRV), coupons, discounts, savings, tax, subtotal, total, payment, change, points.\n' +
    '- Voided, refunded or returned lines.\n' +
    '- Never output the store address, cashier name, card numbers, loyalty or member numbers, phone numbers or any other personal detail printed on the receipt.\n' +
    'If the photo is not a receipt, or no food line can be read, return {"items":[]}.\n' +
    'Examples: {"name":"whole milk","quantity":1,"unit":"gallon","category":"dairy","storage":"fridge","confidence":0.9}\n' +
    '{"name":"chicken breast","quantity":1.25,"unit":"lb","category":"meats","storage":"fridge","confidence":0.88}\n' +
    '{"name":"black beans","quantity":3,"unit":"can","category":"dry_goods","storage":"pantry","confidence":0.6}\n' +
    'Return JSON only matching the schema.'
  );
}

/**
 * Receipt lines for the same product are purchases to add together. (A shelf scan keeps the
 * larger count instead, because there the same product seen twice is the same physical item.)
 */
function sumDuplicateItems(items: DetectedPantryItem[]): DetectedPantryItem[] {
  const byName = new Map<string, DetectedPantryItem>();
  for (const item of items) {
    const key = normalizeNameKey(item.name);
    const prior = byName.get(key);
    if (!prior) {
      byName.set(key, { ...item });
      continue;
    }
    const sameUnit = prior.unit.toLowerCase() === item.unit.toLowerCase();
    byName.set(key, {
      ...prior,
      quantity: sameUnit ? Math.min(9999, prior.quantity + item.quantity) : Math.max(prior.quantity, item.quantity),
      confidence: Math.max(prior.confidence, item.confidence),
    });
  }
  return stableSortItems([...byName.values()]);
}

function parseGeminiErrorDetail(status: number, text: string): { detail: string; retryable: boolean } {
  let detail = text.slice(0, 320);
  try {
    const errJson = JSON.parse(text) as { error?: { message?: string } };
    detail = errJson.error?.message ?? detail;
  } catch {
    /* keep raw snippet */
  }
  return { detail, retryable: isRetryableGeminiHttpFailure(status, detail) };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type GeminiImage = {
  mimeType: string;
  base64: string;
  /** Short fixed caption placed before the image, e.g. "Zoomed crop: top left." */
  caption?: string;
};

type GeminiVisionRequest = {
  prompt: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
};

type GeminiUsage = {
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
};

type GeminiCallSuccess = {
  text: string;
  finishReason?: string;
  usage: GeminiUsage;
};

/** Running totals for one scan, for the log line. */
class ScanStats {
  calls = 0;
  promptTokens = 0;
  outputTokens = 0;
  thoughtTokens = 0;
  emptyAnswers = 0;
  lastFinishReason = '';

  add(usage: GeminiUsage, finishReason: string | undefined): void {
    this.calls += 1;
    this.promptTokens += usage.promptTokens;
    this.outputTokens += usage.outputTokens;
    this.thoughtTokens += usage.thoughtTokens;
    this.lastFinishReason = finishReason ?? '';
  }
}

function readUsage(raw: unknown): GeminiUsage {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
  return {
    promptTokens: count(row.promptTokenCount),
    outputTokens: count(row.candidatesTokenCount),
    thoughtTokens: count(row.thoughtsTokenCount),
  };
}

const EMPTY_RESPONSE_DETAIL = 'Empty model response';
const GEMINI_THINKING_LEVELS = new Set(['low', 'medium', 'high']);

function isGemini3OrLater(model: string): boolean {
  const match = /^gemini-(\d+)/.exec(model.trim().toLowerCase());
  return match != null && Number(match[1]) >= 3;
}

/**
 * Google's Gemini 3 guide says to remove temperature / top_p / top_k and warns that a
 * temperature below the default can degrade results. Older fallback models keep the
 * near-deterministic settings they were tuned with.
 */
function buildGenerationConfig(
  model: string,
  vision: GeminiVisionRequest,
  env: { legacySampling?: string; thinkingLevel?: string } = {},
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    responseMimeType: 'application/json',
    responseJsonSchema: vision.schema,
    seed: GEMINI_DETERMINISTIC_SEED,
    maxOutputTokens: vision.maxOutputTokens,
  };
  const gemini3 = isGemini3OrLater(model);
  if (!gemini3 || (env.legacySampling ?? '').trim().toLowerCase() === 'on') {
    config.temperature = 0;
    config.topP = 0.1;
  }
  const thinkingLevel = (env.thinkingLevel ?? '').trim().toLowerCase();
  if (gemini3 && GEMINI_THINKING_LEVELS.has(thinkingLevel)) {
    config.thinkingConfig = { thinkingLevel };
  }
  return config;
}

function buildGeminiParts(images: GeminiImage[], prompt: string): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  for (const image of images) {
    if (image.caption) parts.push({ text: image.caption });
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  }
  parts.push({ text: prompt });
  return parts;
}

async function callGeminiOnce(
  apiKey: string,
  model: string,
  images: GeminiImage[],
  vision: GeminiVisionRequest,
  budget: RequestTimeBudget,
  stats?: ScanStats,
): Promise<GeminiCallSuccess | { error: GeminiAttemptError }> {
  const timeoutMs = budget.perCallTimeoutMs(perCallGeminiTimeoutMs());
  if (timeoutMs == null) {
    return { error: { kind: 'timeout', retryable: false } };
  }

  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents: [{ parts: buildGeminiParts(images, vision.prompt) }],
    generationConfig: buildGenerationConfig(model, vision, {
      legacySampling: Deno.env.get('PANTRY_LEGACY_SAMPLING') ?? undefined,
      thinkingLevel: Deno.env.get('GEMINI_THINKING_LEVEL') ?? undefined,
    }),
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const isTimeout =
      error instanceof DOMException
        ? error.name === 'TimeoutError'
        : error instanceof Error && error.name === 'TimeoutError';
    if (isTimeout) {
      return { error: { kind: 'timeout', retryable: false } };
    }
    const message = error instanceof Error ? error.message : 'Network error calling Gemini';
    return {
      error: {
        kind: 'http',
        status: 0,
        detail: message,
        retryable: false,
      },
    };
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    const parsed = parseGeminiErrorDetail(upstream.status, text);
    return {
      error: {
        kind: 'http',
        status: upstream.status,
        detail: parsed.detail,
        retryable: parsed.retryable,
      },
    };
  }

  try {
    const envelope = JSON.parse(text) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      usageMetadata?: unknown;
      promptFeedback?: { blockReason?: string };
    };
    const candidate = envelope.candidates?.[0];
    const partText =
      candidate?.content?.parts
        ?.filter((p) => p.thought !== true)
        .map((p) => p.text ?? '')
        .join('') ?? '';
    const finishReason = candidate?.finishReason ?? envelope.promptFeedback?.blockReason;
    const usage = readUsage(envelope.usageMetadata);
    stats?.add(usage, finishReason);
    if (!partText.trim()) {
      if (stats) stats.emptyAnswers += 1;
      return {
        error: {
          kind: 'http',
          status: 502,
          detail: finishReason ? `${EMPTY_RESPONSE_DETAIL} (${finishReason})` : EMPTY_RESPONSE_DETAIL,
          retryable: true,
        },
      };
    }
    return { text: partText, finishReason, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse Gemini response';
    return {
      error: {
        kind: 'http',
        status: 502,
        detail: message,
        retryable: false,
      },
    };
  }
}

/** The model ran out of output room (thinking counts against it) before finishing its answer. */
function ranOutOfOutputTokens(result: GeminiCallSuccess | { error: GeminiAttemptError }): boolean {
  if ('error' in result) {
    return result.error.kind === 'http' && result.error.detail === `${EMPTY_RESPONSE_DETAIL} (MAX_TOKENS)`;
  }
  return result.finishReason === 'MAX_TOKENS';
}

async function callPantryGeminiPass(
  apiKey: string,
  model: string,
  images: GeminiImage[],
  prompt: string,
  maxOutputTokens: number,
  budget: RequestTimeBudget,
  stats?: ScanStats,
): Promise<{ items: DetectedPantryItem[] } | { error: GeminiAttemptError }> {
  let result = await callGeminiOnce(apiKey, model, images, {
    prompt,
    schema: RESPONSE_JSON_SCHEMA,
    maxOutputTokens,
  }, budget, stats);

  let retriedForLength = false;
  if (ranOutOfOutputTokens(result)) {
    retriedForLength = true;
    result = await callGeminiOnce(apiKey, model, images, {
      prompt,
      schema: RESPONSE_JSON_SCHEMA,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_RETRY,
    }, budget, stats);
  }

  // An empty answer is a failed call, not "nothing on the shelf": a real empty shelf comes
  // back as {"items":[]}. Returning the error lets the caller retry and then try the next model.
  if ('error' in result) return result;

  try {
    const parsed = JSON.parse(result.text) as unknown;
    return { items: sanitizeItems(parsed) };
  } catch {
    return {
      error: {
        kind: 'http',
        status: 502,
        detail: retriedForLength ? 'Truncated JSON after MAX_TOKENS retry' : 'Failed to parse pantry JSON',
        retryable: true,
      },
    };
  }
}

/** Second "what did I miss" call. Off unless the PANTRY_VERIFY_PASS secret is "on": it doubles the cost of a scan. */
function verifyPassEnabled(raw: string | undefined): boolean {
  return (raw ?? '').trim().toLowerCase() === 'on';
}

async function callPantryGeminiTwoPass(
  apiKey: string,
  model: string,
  images: GeminiImage[],
  scanLocation: (typeof PANTRY_STORAGE)[number],
  budget: RequestTimeBudget,
  stats?: ScanStats,
  /** Receipt scans: one pass with this prompt, and duplicate lines are added together. */
  receipt: boolean = false,
): Promise<{ items: DetectedPantryItem[]; passes: 1 | 2 } | { error: GeminiAttemptError }> {
  const tileCount = Math.max(0, images.length - 1);
  const passOne = await callPantryGeminiPass(
    apiKey,
    model,
    images,
    receipt ? receiptPrompt(tileCount) : geminiEnumeratePrompt(scanLocation, tileCount),
    GEMINI_MAX_OUTPUT_TOKENS,
    budget,
    stats,
  );
  if ('error' in passOne) return passOne;

  if (receipt) {
    return { items: sumDuplicateItems(passOne.items), passes: 1 };
  }

  const passOneDeduped = dedupeItems(passOne.items);

  if (!verifyPassEnabled(Deno.env.get('PANTRY_VERIFY_PASS') ?? undefined) || budget.isExhausted()) {
    return { items: passOneDeduped, passes: 1 };
  }

  const passTwo = await callPantryGeminiPass(
    apiKey,
    model,
    images,
    geminiVerifyPrompt(scanLocation, passOneDeduped.map((i) => i.name), tileCount),
    GEMINI_MAX_OUTPUT_TOKENS,
    budget,
    stats,
  );
  if ('error' in passTwo) {
    return { items: passOneDeduped, passes: 1 };
  }

  if (passTwo.items.length === 0) {
    return { items: passOneDeduped, passes: 1 };
  }

  return { items: mergeItemPasses(passOneDeduped, passTwo.items), passes: 2 };
}

async function callPriceTagGeminiOnce(
  apiKey: string,
  model: string,
  mimeType: string,
  imageBase64: string,
  budget: RequestTimeBudget,
): Promise<{ tag: SanitizedPriceTag } | { error: GeminiAttemptError }> {
  const result = await callGeminiOnce(apiKey, model, [{ mimeType, base64: imageBase64 }], {
    prompt: priceTagPrompt(),
    schema: PRICE_TAG_JSON_SCHEMA,
    maxOutputTokens: 1024,
  }, budget);
  if ('error' in result) return result;
  try {
    const parsed = JSON.parse(result.text) as unknown;
    const tag = sanitizePriceTag(parsed);
    if (!tag) {
      return {
        error: {
          kind: 'http',
          status: 502,
          detail: 'Could not read a price from the tag',
          retryable: true,
        },
      };
    }
    return { tag };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse price tag response';
    return {
      error: {
        kind: 'http',
        status: 502,
        detail: message,
        retryable: false,
      },
    };
  }
}

function formatAttemptError(model: string, error: GeminiAttemptError, timeoutMs: number): string {
  if (error.kind === 'timeout') {
    return `${model}: timed out (budget or ${timeoutMs}ms per call)`;
  }
  const statusLabel = error.status > 0 ? String(error.status) : 'network';
  return `${model} (${statusLabel}): ${error.detail}`;
}

async function callPantryGeminiOnModel(
  apiKey: string,
  model: string,
  images: GeminiImage[],
  scanLocation: (typeof PANTRY_STORAGE)[number],
  budget: RequestTimeBudget,
  stats?: ScanStats,
  receipt: boolean = false,
): Promise<{ items: DetectedPantryItem[]; passes: 1 | 2 } | { error: GeminiAttemptError }> {
  let httpRetries = 0;

  while (true) {
    if (budget.isExhausted()) {
      return { error: { kind: 'timeout', retryable: false } };
    }

    const result = await callPantryGeminiTwoPass(
      apiKey,
      model,
      images,
      scanLocation,
      budget,
      stats,
      receipt,
    );
    if ('items' in result) return result;

    if (result.error.kind === 'timeout') {
      geminiModelTimeoutMemory.record(model, Date.now(), isLargePantryImageBase64(images[0]?.base64 ?? ''));
      return result;
    }

    if (!shouldRetrySameModelAfterError(result.error, httpRetries)) {
      return result;
    }

    httpRetries += 1;
    await sleep(GEMINI_RETRY_BACKOFF_MS * httpRetries);
  }
}

async function callPriceTagGeminiOnModel(
  apiKey: string,
  model: string,
  mimeType: string,
  imageBase64: string,
  budget: RequestTimeBudget,
): Promise<{ tag: SanitizedPriceTag } | { error: GeminiAttemptError }> {
  let httpRetries = 0;

  while (true) {
    if (budget.isExhausted()) {
      return { error: { kind: 'timeout', retryable: false } };
    }

    const result = await callPriceTagGeminiOnce(apiKey, model, mimeType, imageBase64, budget);
    if ('tag' in result) return result;

    if (result.error.kind === 'timeout') {
      geminiModelTimeoutMemory.record(model);
      return result;
    }

    if (!shouldRetrySameModelAfterError(result.error, httpRetries)) {
      return result;
    }

    httpRetries += 1;
    await sleep(GEMINI_RETRY_BACKOFF_MS * httpRetries);
  }
}

/**
 * One line per scan for measuring cost and consistency. Numbers only: no user id, no item
 * names, nothing from the photo.
 */
function formatScanLogLine(scan: {
  ok: boolean;
  model: string;
  items: number;
  passes: number;
  images: number;
  imageBytes: number;
  ms: number;
  attempts: number;
  stats: ScanStats;
  /** Items after the first whole-photo pass, before any thorough crop calls. */
  firstPassItems?: number;
  tileCalls?: number;
  tilesOk?: number;
  kind?: VisionAction;
}): string {
  const { stats } = scan;
  return (
    `pantry-vision: scan ${scan.ok ? 'ok' : 'failed'}` +
    ` model=${scan.model || 'none'} items=${scan.items} passes=${scan.passes}` +
    ` images=${scan.images} imageBytes=${scan.imageBytes} ms=${scan.ms}` +
    ` calls=${stats.calls} modelsTried=${scan.attempts} emptyAnswers=${stats.emptyAnswers}` +
    ` promptTokens=${stats.promptTokens} outputTokens=${stats.outputTokens} thoughtTokens=${stats.thoughtTokens}` +
    ` finish=${stats.lastFinishReason || 'unknown'}` +
    ` thorough=${(scan.tileCalls ?? 0) > 0 ? 1 : 0} firstPassItems=${scan.firstPassItems ?? scan.items}` +
    ` tileCalls=${scan.tileCalls ?? 0} tilesOk=${scan.tilesOk ?? 0} kind=${scan.kind ?? 'pantry'}`
  );
}

// --- Thorough scan: one call per zoomed crop ---
// Asked to list a whole busy shelf in one answer, the model stops early (36 of 100+ on the
// owner's pantry). Asked about one crop at a time it has a quarter as much to list, so less
// gets left out. It costs about four extra calls, so by default it runs only on busy photos.

type ThoroughScanMode = 'auto' | 'off' | 'always';
const PANTRY_THOROUGH_MIN_ITEMS_DEFAULT = 20;

function parseThoroughScanMode(raw: string | undefined): ThoroughScanMode {
  const value = (raw ?? '').trim().toLowerCase();
  return value === 'off' || value === 'always' ? value : 'auto';
}

function parseThoroughMinItems(raw: string | undefined): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 500 ? parsed : PANTRY_THOROUGH_MIN_ITEMS_DEFAULT;
}

function shouldRunThoroughScan(input: {
  mode: ThoroughScanMode;
  tileCount: number;
  firstPassItems: number;
  minItems: number;
}): boolean {
  if (input.mode === 'off') return false;
  if (input.tileCount < 2) return false; // small photo: no crops, nothing more to look at
  if (input.mode === 'always') return true;
  return input.firstPassItems >= input.minItems;
}

/** One crop, checked by itself (with the full photo for context). Same-model retries only. */
async function scanOneTile(
  apiKey: string,
  model: string,
  main: GeminiImage,
  tile: GeminiImage,
  cropFocus: string,
  scanLocation: (typeof PANTRY_STORAGE)[number],
  budget: RequestTimeBudget,
  stats: ScanStats,
): Promise<DetectedPantryItem[] | null> {
  let httpRetries = 0;
  while (true) {
    if (budget.isExhausted()) return null;
    const result = await callPantryGeminiPass(
      apiKey,
      model,
      [{ ...main, caption: 'Full photo, for context:' }, tile],
      geminiEnumeratePrompt(scanLocation, 1, cropFocus),
      GEMINI_MAX_OUTPUT_TOKENS,
      budget,
      stats,
    );
    if ('items' in result) return result.items;
    if (result.error.kind === 'timeout' || !shouldRetrySameModelAfterError(result.error, httpRetries)) {
      console.warn(`pantry-vision: thorough crop failed ${formatAttemptError(model, result.error, perCallGeminiTimeoutMs())}`);
      return null;
    }
    httpRetries += 1;
    await sleep(GEMINI_RETRY_BACKOFF_MS * httpRetries);
  }
}

/**
 * Checks every crop in parallel and returns what they found. A crop that fails is skipped:
 * the first pass and the other crops still stand.
 */
async function runThoroughTileScans(
  apiKey: string,
  model: string,
  main: GeminiImage,
  tiles: Array<{ image: GeminiImage; position: string }>,
  scanLocation: (typeof PANTRY_STORAGE)[number],
  budget: RequestTimeBudget,
  stats: ScanStats,
): Promise<{ items: DetectedPantryItem[]; tileCalls: number; tilesOk: number }> {
  const results = await Promise.all(
    tiles.map((tile) => scanOneTile(apiKey, model, main, tile.image, tile.position, scanLocation, budget, stats)),
  );
  const ok = results.filter((items): items is DetectedPantryItem[] => items != null);
  return { items: ok.flat(), tileCalls: tiles.length, tilesOk: ok.length };
}

const UPSTREAM_BUSY_MESSAGE =
  'Vision scan is busy right now. Try again in a moment.';

/**
 * Google refused the request because of the account, not the photo: the prepaid credit has run
 * out (402) or the key is not accepted (401). Trying again cannot help until the owner fixes it,
 * so the app is told "unavailable", not "busy". Seen live on 2026-10-10 (credit used up).
 */
class ScanUnavailableError extends Error {}
const SCAN_UNAVAILABLE_MESSAGE = 'Photo scanning is temporarily unavailable. Please try again later.';

function isAccountRefusal(error: GeminiAttemptError): boolean {
  return error.kind === 'http' && (error.status === 402 || error.status === 401);
}

async function callPantryGeminiWithFallbacks(
  apiKey: string,
  images: GeminiImage[],
  scanLocation: (typeof PANTRY_STORAGE)[number],
  stats: ScanStats = new ScanStats(),
  budget: RequestTimeBudget = new RequestTimeBudget(GEMINI_REQUEST_TOTAL_BUDGET_MS),
  receipt: boolean = false,
): Promise<{
  items: DetectedPantryItem[];
  model: string;
  debug: { modelAttempts: GeminiModelAttemptDebug[]; geminiPasses: number };
}> {
  const imageIsLarge = isLargePantryImageBase64(images[0]?.base64 ?? '');
  const candidates = orderModelsForAttempt(
    Deno.env.get('GEMINI_MODEL') ?? undefined,
    Deno.env.get('GEMINI_FALLBACK_MODELS') ?? undefined,
    geminiModelTimeoutMemory,
    Date.now(),
    imageIsLarge,
  );

  const failures: string[] = [];
  const modelAttempts: GeminiModelAttemptDebug[] = [];

  for (const model of candidates) {
    if (budget.isExhausted()) {
      failures.push('request time budget exhausted before next model');
      modelAttempts.push({
        model,
        ok: false,
        message: 'request time budget exhausted before next model',
      });
      break;
    }

    const result = await callPantryGeminiOnModel(
      apiKey,
      model,
      images,
      scanLocation,
      budget,
      stats,
      receipt,
    );
    if ('items' in result) {
      modelAttempts.push({ model, ok: true });
      console.log(
        `pantry-vision: gemini ok model=${model} items=${result.items.length} passes=${result.passes}`,
      );
      return {
        items: result.items,
        model,
        debug: { modelAttempts, geminiPasses: result.passes },
      };
    }
    const failureMessage = formatAttemptError(model, result.error, perCallGeminiTimeoutMs());
    failures.push(failureMessage);
    modelAttempts.push({
      model,
      ok: false,
      status: result.error.kind === 'http' ? result.error.status : undefined,
      message: failureMessage,
    });
    console.warn(`pantry-vision: gemini failed ${failures[failures.length - 1]}`);
    // The same account answers for every model: no point trying the others.
    if (isAccountRefusal(result.error)) throw new ScanUnavailableError(failureMessage);
  }

  const summary = failures.slice(-4).join(' | ');
  throw new Error(
    failures.some((f) => f.includes('budget'))
      ? `${UPSTREAM_BUSY_MESSAGE} (${summary})`
      : `Pantry scan could not reach Gemini after trying ${candidates.length} model(s). ${summary}`,
  );
}

async function callPriceTagGeminiWithFallbacks(
  apiKey: string,
  mimeType: string,
  imageBase64: string,
): Promise<{ tag: SanitizedPriceTag; model: string }> {
  const budget = new RequestTimeBudget(GEMINI_REQUEST_TOTAL_BUDGET_MS);
  const candidates = orderModelsForAttempt(
    Deno.env.get('GEMINI_MODEL') ?? undefined,
    Deno.env.get('GEMINI_FALLBACK_MODELS') ?? undefined,
    geminiModelTimeoutMemory,
  );

  const failures: string[] = [];

  for (const model of candidates) {
    if (budget.isExhausted()) {
      failures.push('request time budget exhausted before next model');
      break;
    }

    const result = await callPriceTagGeminiOnModel(apiKey, model, mimeType, imageBase64, budget);
    if ('tag' in result) {
      console.log(`pantry-vision: price-tag ok model=${model} item=${result.tag.itemName}`);
      return { tag: result.tag, model };
    }
    failures.push(formatAttemptError(model, result.error, perCallGeminiTimeoutMs()));
    console.warn(`pantry-vision: price-tag failed ${failures[failures.length - 1]}`);
    if (isAccountRefusal(result.error)) throw new ScanUnavailableError(failures[failures.length - 1]);
  }

  const summary = failures.slice(-4).join(' | ');
  throw new Error(
    failures.some((f) => f.includes('budget'))
      ? `${UPSTREAM_BUSY_MESSAGE} (${summary})`
      : `Could not read the shelf tag after trying ${candidates.length} model(s). ${summary}`,
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const userId = userIdFromJwt(req);
  if (!userId) {
    return jsonResponse({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401);
  }

  const tier = await loadScanTier(userId);
  if (!tier) {
    return jsonResponse(
      {
        error: 'Could not check your plan. Please try again.',
        code: 'PLAN_REQUIRED',
      },
      403,
    );
  }

  if (!checkUserRateLimit(userId)) {
    return jsonResponse(
      {
        error: 'Too many pantry scans. Wait a minute and try again.',
        code: 'RATE_LIMIT',
      },
      429,
    );
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          'Pantry photo scan is not set up yet. Ask an admin to finish setup.',
        code: 'NOT_CONFIGURED',
      },
      503,
    );
  }

  try {
    const imageResult = await readImageFromRequest(req);
    if (imageResult instanceof Response) return imageResult;

    const imageBase64 = bytesToBase64(imageResult.bytes);
    const contentHash = imageResult.imageHash || (await sha256Hex(imageResult.bytes));
    const cacheKey = `${PANTRY_VISION_CACHE_VERSION}|${imageResult.action}|${imageResult.scanLocation}|${contentHash}|t${imageResult.tiles.length}`;

    // Every tier has a monthly pool of shelf, fridge and receipt scans. Price tags are for paid
    // tiers only (a free account's limit for them is 0).
    const allowance = scanAllowanceFor(
      tier,
      imageResult.action,
      new Date(),
      Deno.env.get('PLAN_LIMITS_OVERRIDE') ?? undefined,
    );
    if (allowance.limit <= 0) {
      return scanLimitResponse(tier, allowance, imageResult.action);
    }

    /**
     * Claims one scan. Returns a Response when the scan must not run. When the counter cannot be
     * reached, a paying account still scans (the cap is a cost guard, not a reason to fail a
     * customer) and a free account does not (no counter, no free scans).
     */
    const claimOrRefuse = async (): Promise<{ counted: boolean; remaining: number } | Response> => {
      const claim = await claimScan(userId, allowance);
      if (claim.state === 'claimed') return { counted: allowance.period != null, remaining: claim.remaining };
      if (claim.state === 'used-up') return scanLimitResponse(tier, allowance, imageResult.action);
      if (tier === 'free') {
        return jsonResponse({ error: 'Photo scanning is part of the paid plans.', code: 'PLAN_REQUIRED' }, 403);
      }
      return { counted: false, remaining: Number.POSITIVE_INFINITY };
    };

    if (imageResult.action === 'price-tag') {
      const claimed = await claimOrRefuse();
      if (claimed instanceof Response) return claimed;
      let tagScan: Awaited<ReturnType<typeof callPriceTagGeminiWithFallbacks>>;
      try {
        tagScan = await callPriceTagGeminiWithFallbacks(apiKey, imageResult.mimeType, imageBase64);
      } catch (tagError) {
        if (claimed.counted) await settleScan(userId, allowance.period, { inputTokens: 0, outputTokens: 0 }, true);
        throw tagError;
      }
      const { tag, model } = tagScan;
      return jsonResponse(
        {
          itemName: tag.itemName,
          price: tag.price,
          sizeUnit: tag.sizeUnit ?? null,
          saleValidUntil: tag.saleValidUntil ?? null,
          model,
          usage: usageForResponse(tier, allowance, claimed.remaining),
        },
        200,
      );
    }

    const cached = getCachedScan(cacheKey);
    if (cached) {
      return jsonResponse(
        {
          items: cached.items,
          model: cached.model,
          scanLocation: imageResult.scanLocation,
          cached: true,
          itemCount: cached.items.length,
        },
        200,
      );
    }

    // The same request from the same account may already be running in another worker (a phone
    // browser resends when its connection drops). Wait for that answer instead of scanning twice.
    const requestKey = cacheKey;
    let request = await beginScanRequest(userId, requestKey);
    const waitStartedAt = Date.now();
    while (request.state === 'running' && Date.now() - waitStartedAt < SCAN_REQUEST_MAX_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, SCAN_REQUEST_POLL_MS));
      request = await beginScanRequest(userId, requestKey);
    }
    if (request.state === 'running') {
      return jsonResponse(
        { error: 'This photo is still being scanned. Try again in a moment.', code: 'UPSTREAM_BUSY' },
        503,
      );
    }
    if (request.state === 'done') {
      const shared = request.result;
      console.log(
        `pantry-vision: scan shared items=${shared.items.length} waitedMs=${Date.now() - waitStartedAt} kind=${imageResult.action}`,
      );
      return jsonResponse(
        {
          items: shared.items,
          model: shared.model,
          usage: shared.usage,
          scanLocation: imageResult.scanLocation,
          kind: imageResult.action,
          cached: true,
          shared: true,
          itemCount: shared.items.length,
        },
        200,
      );
    }
    const tracked = request.state === 'started';
    let answer: SharedScanResult | null = null;
    try {
      const isReceipt = imageResult.action === 'receipt';
      const images: GeminiImage[] = [
        {
          mimeType: imageResult.mimeType,
          base64: imageBase64,
          caption: imageResult.tiles.length > 0 ? (isReceipt ? 'Whole receipt:' : 'Full photo:') : undefined,
        },
        ...imageResult.tiles.map((tile) => ({
          mimeType: tile.mimeType,
          base64: tile.base64,
          caption: isReceipt
            ? tile.position
              ? `Zoomed strip of the same receipt (${tile.position}):`
              : 'Zoomed strip of the same receipt:'
            : tile.position
              ? `Zoomed crop of the same photo (${tile.position}):`
              : 'Zoomed crop of the same photo:',
        })),
      ];
      const imageBytes = imageResult.bytes.byteLength + imageResult.tiles.reduce((sum, tile) => sum + tile.byteLength, 0);
      const stats = new ScanStats();
      const startedAt = Date.now();

      // Taken before the model is called, so parallel requests cannot overshoot the allowance.
      const claimed = await claimOrRefuse();
      if (claimed instanceof Response) return claimed;

      const budget = new RequestTimeBudget(GEMINI_REQUEST_TOTAL_BUDGET_MS);
      let scan: Awaited<ReturnType<typeof callPantryGeminiWithFallbacks>>;
      try {
        scan = await callPantryGeminiWithFallbacks(apiKey, images, imageResult.scanLocation, stats, budget, isReceipt);
      } catch (scanError) {
        console.warn(
          formatScanLogLine({
            ok: false,
            model: '',
            items: 0,
            passes: 0,
            images: images.length,
            imageBytes,
            ms: Date.now() - startedAt,
            attempts: 0,
            stats,
            kind: imageResult.action,
          }),
        );
        // A scan that produced nothing is not charged against the allowance.
        if (claimed.counted) await settleScan(userId, allowance.period, { inputTokens: 0, outputTokens: 0 }, true);
        throw scanError;
      }
      const { model, debug } = scan;
      let items = scan.items;
      const firstPassItems = items.length;
      let thorough = { tileCalls: 0, tilesOk: 0 };
      if (
        // A receipt is printed text read in one pass; splitting it would count lines on a seam twice.
        !isReceipt &&
        shouldRunThoroughScan({
          mode: parseThoroughScanMode(Deno.env.get('PANTRY_THOROUGH_SCAN') ?? undefined),
          tileCount: imageResult.tiles.length,
          firstPassItems,
          minItems: parseThoroughMinItems(Deno.env.get('PANTRY_THOROUGH_MIN_ITEMS') ?? undefined),
        }) &&
        !budget.isExhausted()
      ) {
        const tileScan = await runThoroughTileScans(
          apiKey,
          model,
          images[0],
          imageResult.tiles.map((tile, index) => ({ image: images[index + 1], position: tile.position })),
          imageResult.scanLocation,
          budget,
          stats,
        );
        thorough = { tileCalls: tileScan.tileCalls, tilesOk: tileScan.tilesOk };
        // The same product seen in the whole photo and in a crop, or in two overlapping crops, is one row.
        items = mergeItemPasses(items, tileScan.items);
      }
      console.log(
        formatScanLogLine({
          ok: true,
          model,
          items: items.length,
          passes: debug.geminiPasses,
          images: images.length,
          imageBytes,
          ms: Date.now() - startedAt,
          attempts: debug.modelAttempts.length,
          stats,
          firstPassItems,
          tileCalls: thorough.tileCalls,
          tilesOk: thorough.tilesOk,
          kind: imageResult.action,
        }),
      );

      setCachedScan(cacheKey, items, model);
      answer = { items, model, usage: usageForResponse(tier, allowance, claimed.remaining) };
      if (claimed.counted) {
        await settleScan(
          userId,
          allowance.period,
          { inputTokens: stats.promptTokens, outputTokens: stats.outputTokens + stats.thoughtTokens },
          false,
        );
      }

      return jsonResponse(
        {
          items,
          model,
          usage: usageForResponse(tier, allowance, claimed.remaining),
          debug: {
            ...debug,
            images: images.length,
            thorough: { ...thorough, firstPassItems },
            usage: {
              promptTokens: stats.promptTokens,
              outputTokens: stats.outputTokens,
              thoughtTokens: stats.thoughtTokens,
              calls: stats.calls,
            },
          },
          scanLocation: imageResult.scanLocation,
          kind: imageResult.action,
          cached: false,
          itemCount: items.length,
        },
        200,
      );
    } finally {
      // Whatever happened, a repeat must not wait on this request for longer than it ran.
      if (tracked) await finishScanRequest(userId, requestKey, answer);
    }
  } catch (error) {
    if (error instanceof ScanUnavailableError) {
      // One fixed line to search the log for; Google's own wording stays in the line above it.
      console.warn('pantry-vision: ALERT scanner unavailable: Google refused the account (billing or key)');
      return jsonResponse({ error: SCAN_UNAVAILABLE_MESSAGE, code: 'SCAN_UNAVAILABLE' }, 503);
    }
    const message = error instanceof Error ? error.message : 'Something went wrong while analyzing your photo.';
    return jsonResponse({ error: message, code: 'UPSTREAM_ERROR' }, 502);
  }
});
