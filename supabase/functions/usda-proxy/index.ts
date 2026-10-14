// USDA FoodData Central proxy — paste this ENTIRE file into Supabase Dashboard:
// Edge Functions → Deploy a new function → Via Editor → name: usda-proxy
//
// Settings: leave "Verify JWT" ENABLED (default). Authenticated app users only.
//
// Secrets (Edge Functions → Secrets): USDA_API_KEY = your data.gov FoodData Central key

const USDA_SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const USDA_FOOD = 'https://api.nal.usda.gov/fdc/v1/food';

/** USDA rejects a single comma-joined value with parentheses; send repeated `dataType` params. */
const DEFAULT_SEARCH_DATA_TYPES = ['Foundation', 'SR Legacy'];

/** Production web app and common Expo web dev origins (Origin header has no path). */
const ALLOWED_ORIGINS = new Set([
  'https://mealplanatic.app',
  'https://www.mealplanatic.app',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:19000',
]);

const SEARCH_QUERY_KEYS = new Set(['query', 'pageSize', 'dataType']);

type UsdaProxyRequest =
  | { action: 'search'; query?: Record<string, string | number | undefined> }
  | { action: 'food'; fdcId: number };

interface CacheEntry {
  body: string;
  status: number;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow =
    origin && (ALLOWED_ORIGINS.has(origin) || origin.startsWith('http://localhost:'))
      ? origin
      : 'https://mealplanatic.app';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function appendDataTypeParams(params: URLSearchParams, raw: string | undefined): void {
  const parts = (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const types = parts.length > 0 ? parts : DEFAULT_SEARCH_DATA_TYPES;
  for (const dataType of types) {
    params.append('dataType', dataType);
  }
}

function pickSearchQuery(
  input: Record<string, string | number | undefined> | undefined,
): URLSearchParams {
  const params = new URLSearchParams();
  let dataTypeRaw: string | undefined;
  if (input) {
    for (const [key, value] of Object.entries(input)) {
      if (!SEARCH_QUERY_KEYS.has(key)) continue;
      if (value === undefined || value === null || value === '') continue;
      if (key === 'dataType') {
        dataTypeRaw = String(value);
        continue;
      }
      params.set(key, String(value));
    }
  }
  appendDataTypeParams(params, dataTypeRaw);
  return params;
}

function readCache(key: string): CacheEntry | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return hit;
}

function writeCache(key: string, body: string, status: number): void {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const first = responseCache.keys().next().value;
    if (first) responseCache.delete(first);
  }
  responseCache.set(key, { body, status, expiresAt: Date.now() + CACHE_TTL_MS });
}

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

Deno.serve(async (req) => {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const userId = userIdFromJwt(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Sign in required', code: 'UNAUTHENTICATED' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = (Deno.env.get('USDA_API_KEY') ?? '').trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          'USDA nutrition lookup is not set up yet. Ask an admin to finish setup.',
        code: 'NOT_CONFIGURED',
      }),
      {
        status: 503,
        headers: { ...cors, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const body = (await req.json()) as UsdaProxyRequest;
    let upstreamUrl = '';

    if (body.action === 'search') {
      const params = pickSearchQuery(body.query);
      const q = (params.get('query') ?? '').trim();
      if (!q) {
        return new Response(JSON.stringify({ error: 'Search query is required' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      if (!params.has('pageSize')) params.set('pageSize', '8');
      params.set('api_key', apiKey);
      upstreamUrl = `${USDA_SEARCH}?${params.toString()}`;
    } else if (body.action === 'food') {
      const id = Number(body.fdcId);
      if (!Number.isFinite(id) || id <= 0) {
        return new Response(JSON.stringify({ error: 'Invalid food ID' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const params = new URLSearchParams({ api_key: apiKey });
      upstreamUrl = `${USDA_FOOD}/${encodeURIComponent(String(id))}?${params.toString()}`;
    } else {
      return new Response(JSON.stringify({ error: 'Unknown action' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const cacheKey = upstreamUrl;
    const cached = readCache(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      });
    }

    const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json' } });
    const text = await upstream.text();
    if (upstream.ok) {
      writeCache(cacheKey, text, upstream.status);
    }

    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'USDA proxy error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
