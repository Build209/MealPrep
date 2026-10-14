// RecipeAPI.io proxy — paste this ENTIRE file into Supabase Dashboard:
// Edge Functions → Deploy a new function → Via Editor → name: recipeapi-proxy
//
// Settings: leave "Verify JWT" ENABLED (default). Guests may call with the publishable
// anon key; signed-in users send their session JWT. Rate limits use user id or client IP.
//
// Secrets (Edge Functions → Secrets): RECIPEAPI_KEY = your sk_live_... key

const RECIPE_API_BASE = 'https://recipeapi.io/api/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LIST_QUERY_KEYS = new Set([
  'search',
  'search_in',
  'ingredients',
  'cuisine',
  'meal_type',
  'difficulty',
  'dietary_tags',
  'prep_time_min',
  'prep_time_max',
  'cook_time_min',
  'cook_time_max',
  'calories_per_serving_min',
  'calories_per_serving_max',
  'protein_min',
  'protein_max',
  'sort',
  'order',
  'per_page',
  'page',
  'lang',
]);

const RANDOM_QUERY_KEYS = new Set([
  'search',
  'search_in',
  'ingredients',
  'cuisine',
  'meal_type',
  'difficulty',
  'dietary_tags',
  'prep_time_min',
  'prep_time_max',
  'cook_time_min',
  'cook_time_max',
  'calories_per_serving_min',
  'calories_per_serving_max',
  'protein_min',
  'protein_max',
  'lang',
]);

type ProxyRequest =
  | { action: 'list'; query?: Record<string, string | number | boolean | undefined> }
  | { action: 'detail'; id: number; query?: Record<string, string | undefined> }
  | { action: 'random'; query?: Record<string, string | number | boolean | undefined> };

interface CacheEntry {
  body: string;
  status: number;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

const userHits = new Map<string, { count: number; windowStart: number }>();
const USER_WINDOW_MS = 60_000;
const USER_MAX_PER_WINDOW = 30;

function pickQuery(
  input: Record<string, string | number | boolean | undefined> | undefined,
  allowed: Set<string>,
): URLSearchParams {
  const params = new URLSearchParams();
  if (!input) return params;
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
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

function rateLimitKey(req: Request): string {
  const userId = userIdFromJwt(req);
  if (userId) return userId;
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'anon';
  return `anon:${ip}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const limitKey = rateLimitKey(req);
  if (!limitKey) {
    return new Response(JSON.stringify({ error: 'Sign in required', code: 'UNAUTHENTICATED' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!checkUserRateLimit(limitKey)) {
    return new Response(
      JSON.stringify({ error: 'Too many recipe searches. Try again in a minute.', code: 'RATE_LIMIT' }),
      {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const apiKey = Deno.env.get('RECIPEAPI_KEY') ?? '';
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'Recipe discovery is not set up yet. Ask an admin to finish setup.',
        code: 'NOT_CONFIGURED',
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const body = (await req.json()) as ProxyRequest;
    let upstreamUrl = '';

    if (body.action === 'list') {
      const params = pickQuery(body.query, LIST_QUERY_KEYS);
      upstreamUrl = `${RECIPE_API_BASE}/recipes?${params.toString()}`;
    } else if (body.action === 'random') {
      const params = pickQuery(body.query, RANDOM_QUERY_KEYS);
      upstreamUrl = `${RECIPE_API_BASE}/recipes/random?${params.toString()}`;
    } else if (body.action === 'detail') {
      const id = Number(body.id);
      if (!Number.isFinite(id) || id <= 0) {
        return new Response(JSON.stringify({ error: 'Invalid recipe ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const params = pickQuery(body.query, new Set(['lang']));
      const qs = params.toString();
      upstreamUrl = `${RECIPE_API_BASE}/recipes/${id}${qs ? `?${qs}` : ''}`;
    } else {
      return new Response(JSON.stringify({ error: 'Unknown action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const key = upstreamUrl;
    const cached = readCache(key);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      });
    }

    const upstream = await fetch(upstreamUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await upstream.text();
    if (upstream.ok) {
      writeCache(key, text, upstream.status);
    }

    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recipe API proxy error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
