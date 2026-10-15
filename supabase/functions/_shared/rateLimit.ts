/**
 * Per-minute rate limits for the AI and search edge functions, shared across function copies.
 *
 * Signed-in callers are counted in the database by `public.take_rate_limit` (migration
 * db/supabase/migrations/20261016000000_ai_rate_limits.sql). The call is made with the caller's
 * own session token, so the database counts `auth.uid()` from a verified token, never an id or
 * network address the caller supplies.
 *
 * Falls back to the old in-memory counter (per function copy) when:
 *   - the caller is a guest (no account id in the token; the database function is signed-in only),
 *   - SUPABASE_URL or SUPABASE_ANON_KEY is not set,
 *   - the database function is missing (functions deployed before the migration is on live),
 *   - or the call fails or times out.
 * So deploying functions and applying the migration can happen in either order.
 */

export type RateLimitSource = 'database' | 'memory';

export interface RateLimitResult {
  allowed: boolean;
  source: RateLimitSource;
}

export interface RateLimiter {
  /**
   * Takes one hit for this request. `fallbackKey` names the in-memory bucket used when the
   * database cannot be used (the account id for signed-in callers, a network address for guests).
   */
  take(req: Request, fallbackKey: string): Promise<RateLimitResult>;
}

type Env = { get(name: string): string | undefined };

const DB_TIMEOUT_MS = 2_000;
const MAX_MEMORY_KEYS = 10_000;

function env(): Env | null {
  const deno = (globalThis as { Deno?: { env?: Env } }).Deno;
  return deno?.env ?? null;
}

/** The same fixed-window counter the functions used before, kept as the fallback. */
export function createMemoryLimiter(limit: number, windowMs: number): (key: string) => boolean {
  const hits = new Map<string, { count: number; windowStart: number }>();
  return (key: string) => {
    const now = Date.now();
    const bucket = hits.get(key);
    if (!bucket || now - bucket.windowStart > windowMs) {
      if (!bucket && hits.size >= MAX_MEMORY_KEYS) {
        for (const [k, b] of hits) if (now - b.windowStart > windowMs) hits.delete(k);
        if (hits.size >= MAX_MEMORY_KEYS) {
          const oldest = hits.keys().next().value;
          if (oldest !== undefined) hits.delete(oldest);
        }
      }
      hits.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  };
}

/** The bearer token, if it carries an account id (`sub`). Guest (publishable key) tokens do not. */
export function bearerWithUser(req: Request): { token: string; userId: string } | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? { token, userId: payload.sub } : null;
  } catch {
    return null;
  }
}

/**
 * Guest bucket key from the network address. Prefers the addresses set by the platform edge
 * (cf-connecting-ip, x-real-ip) over the first x-forwarded-for entry, which a caller can supply.
 */
export function clientAddressKey(req: Request): string {
  const direct = req.headers.get('cf-connecting-ip')?.trim() || req.headers.get('x-real-ip')?.trim();
  if (direct) return `ip:${direct}`;
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `ip:${forwarded || 'unknown'}`;
}

const warned = new Set<string>();
function warnOnce(fn: string, reason: string): void {
  const key = `${fn}|${reason}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`${fn}: database rate limit unavailable (${reason}); using in-memory limit`);
}

/** For checks only: forget which warnings were already printed. */
export function resetRateLimitWarnings(): void {
  warned.clear();
}

async function takeFromDatabase(
  fn: string,
  limit: number,
  windowSeconds: number,
  token: string,
): Promise<boolean | null> {
  const e = env();
  const url = e?.get('SUPABASE_URL') ?? '';
  const anonKey = e?.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !anonKey) {
    warnOnce(fn, 'SUPABASE_URL or SUPABASE_ANON_KEY not set');
    return null;
  }
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/take_rate_limit`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_fn: fn, p_limit: limit, p_window_seconds: windowSeconds }),
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    });
    if (!response.ok) {
      let code = '';
      try {
        code = String(((await response.json()) as { code?: unknown })?.code ?? '');
      } catch {
        /* no body */
      }
      warnOnce(fn, code === 'PGRST202' || response.status === 404 ? 'take_rate_limit not found' : `http ${response.status}${code ? ` ${code}` : ''}`);
      return null;
    }
    const body = (await response.json()) as unknown;
    if (typeof body !== 'boolean') {
      warnOnce(fn, 'unexpected answer');
      return null;
    }
    return body;
  } catch (error) {
    warnOnce(fn, error instanceof Error ? error.name : 'network error');
    return null;
  }
}

/**
 * One limiter per function. `fn` must be a name the database function accepts (the function's
 * folder name). `limitPerWindow` and `windowMs` match the old in-memory numbers; the database
 * window is the same length (60 s for per-minute limits).
 */
export function createRateLimiter(fn: string, limitPerWindow: number, windowMs = 60_000): RateLimiter {
  const memory = createMemoryLimiter(limitPerWindow, windowMs);
  const windowSeconds = Math.round(windowMs / 1000);
  return {
    async take(req: Request, fallbackKey: string): Promise<RateLimitResult> {
      const caller = bearerWithUser(req);
      if (caller) {
        const allowed = await takeFromDatabase(fn, limitPerWindow, windowSeconds, caller.token);
        if (allowed !== null) return { allowed, source: 'database' };
      }
      return { allowed: memory(fallbackKey), source: 'memory' };
    },
  };
}
