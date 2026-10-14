/**
 * Canonical Gemini orchestration for pantry-vision (unit tests import this file).
 * Must stay byte-for-byte equivalent to the block between BEGIN/END GEMINI_ORCHESTRATION in index.ts
 * (see npm run test:pantry-vision-gemini-inline).
 */

/** @sync mobile/config/geminiConfig.ts */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_GEMINI_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
] as const;

/** Per upstream HTTP call (each Gemini generateContent). Override via `GEMINI_REQUEST_TIMEOUT_MS` secret. */
export const DEFAULT_GEMINI_REQUEST_TIMEOUT_MS = 50_000;

/** @deprecated Use resolveGeminiRequestTimeoutMs — kept for tests importing the default cap. */
export const GEMINI_REQUEST_TIMEOUT_MS = DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;

/** Base64 length above this is treated as a dense/large pantry photo for timeout memory. */
export const LARGE_PANTRY_IMAGE_BASE64_LENGTH = 2_400_000;

export function parseGeminiRequestTimeoutMs(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 8_000 || parsed > 120_000) {
    return DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;
  }
  return parsed;
}

export function isLargePantryImageBase64(imageBase64: string): boolean {
  return imageBase64.length >= LARGE_PANTRY_IMAGE_BASE64_LENGTH;
}

/** Shared wall-clock budget for one pantry-vision HTTP request (under Supabase ~150s limit). */
export const GEMINI_REQUEST_TOTAL_BUDGET_MS = 110_000;

/** Do not start a new Gemini call when less than this remains on the budget. */
export const GEMINI_MIN_PER_CALL_TIMEOUT_MS = 2_500;

export const MODEL_TIMEOUT_DEPRIORITIZE_MS = 5 * 60 * 1000;

export const GEMINI_HTTP_RETRIES_PER_MODEL = 2;

export function parseCommaSeparatedModels(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function buildGeminiModelCandidates(
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

export function deprioritizeRecentlyTimedOutModels(
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

export class ModelTimeoutMemory {
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

export class RequestTimeBudget {
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

export type GeminiRetryableErrorKind = 'timeout' | 'http';

export function shouldRetrySameModelAfterError(
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

export function orderModelsForAttempt(
  primaryFromEnv: string | undefined,
  fallbacksFromEnv: string | undefined,
  timeoutMemory: ModelTimeoutMemory,
  nowMs: number = Date.now(),
  imageIsLarge: boolean = false,
): string[] {
  const base = buildGeminiModelCandidates(primaryFromEnv, fallbacksFromEnv);
  return timeoutMemory.orderCandidates(base, nowMs, imageIsLarge);
}
