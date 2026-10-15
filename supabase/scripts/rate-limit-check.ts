/**
 * Checks for supabase/functions/_shared/rateLimit.ts and its wiring into the AI/search functions:
 *   - signed-in callers are counted by the database function take_rate_limit, called with the
 *     caller's own token (never an id or address the caller supplies),
 *   - guests, a missing database function, a failed call or missing settings fall back to the old
 *     in-memory per-minute limit, which still stops at the same number,
 *   - guest buckets prefer platform-set address headers over x-forwarded-for,
 *   - the four functions keep their per-minute numbers and 429 answers, and no longer read
 *     x-forwarded-for themselves,
 *   - every function name used is one the migration accepts.
 * No network: fetch is a stand-in.
 *
 * Run from supabase/: npm run test:rate-limit
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Handler = (req: Request) => Promise<Response>;

const env: Record<string, string> = {};
let served: Handler | null = null;
(globalThis as Record<string, unknown>).Deno = {
  env: { get: (name: string) => env[name] },
  serve: (fn: Handler) => {
    served = fn;
  },
};

type RpcCall = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];
let rpcReply: (call: RpcCall) => Response | Promise<Response> = () => new Response('true', { status: 200 });
let otherFetch: ((url: string) => Response) | null = null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('/rest/v1/rpc/take_rate_limit')) {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const call = { url, headers, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> };
    rpcCalls.push(call);
    return rpcReply(call);
  }
  if (otherFetch) return otherFetch(url);
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

const warnings: string[] = [];
const realWarn = console.warn;
console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(' '));

const here = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.resolve(here, '..', 'functions');

(async () => {
  const { createRateLimiter, createMemoryLimiter, clientAddressKey, bearerWithUser, resetRateLimitWarnings } =
    await import('../functions/_shared/rateLimit.ts');

  function jwt(payload: Record<string, unknown>): string {
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.signature`;
  }
  const USER_A = '00000000-0000-4000-8000-00000000aaaa';
  const USER_B = '00000000-0000-4000-8000-00000000bbbb';
  const userReq = (sub: string, headers: Record<string, string> = {}) =>
    new Request('https://fn.test/', { method: 'POST', headers: { Authorization: `Bearer ${jwt({ sub, role: 'authenticated' })}`, ...headers } });
  const guestReq = (headers: Record<string, string> = {}) =>
    new Request('https://fn.test/', { method: 'POST', headers: { Authorization: `Bearer ${jwt({ role: 'anon' })}`, ...headers } });

  function reset(): void {
    rpcCalls.length = 0;
    warnings.length = 0;
    resetRateLimitWarnings();
    rpcReply = () => new Response('true', { status: 200 });
    for (const k of Object.keys(env)) delete env[k];
  }

  // 1. In-memory limiter: same fixed window as before.
  {
    const take = createMemoryLimiter(3, 60_000);
    assert.deepEqual([take('a'), take('a'), take('a'), take('a')], [true, true, true, false]);
    assert.equal(take('b'), true, 'separate per key');
  }
  console.log('ok   memory limiter stops at the limit, per key');

  // 2. Settings missing: in-memory fallback, no network call, same number.
  reset();
  {
    const limiter = createRateLimiter('pantry-vision', 2);
    const results = [];
    for (let i = 0; i < 3; i += 1) results.push(await limiter.take(userReq(USER_A), USER_A));
    assert.deepEqual(results.map((r) => r.allowed), [true, true, false]);
    assert.ok(results.every((r) => r.source === 'memory'));
    assert.equal(rpcCalls.length, 0);
    assert.equal(warnings.length, 1, 'one warning, not one per request');
  }
  console.log('ok   no database settings: in-memory limit, no network call, one warning');

  // 3. Database path: called with the caller's token and the publishable key; the answer decides.
  reset();
  env.SUPABASE_URL = 'https://project.supabase.test/';
  env.SUPABASE_ANON_KEY = 'anon-key-test';
  {
    const limiter = createRateLimiter('recipe-import', 10);
    const req = userReq(USER_A, { 'x-forwarded-for': '6.6.6.6' });
    const first = await limiter.take(req, USER_A);
    assert.deepEqual(first, { allowed: true, source: 'database' });
    assert.equal(rpcCalls.length, 1);
    const call = rpcCalls[0];
    assert.equal(call.url, 'https://project.supabase.test/rest/v1/rpc/take_rate_limit');
    assert.equal(call.headers.apikey, 'anon-key-test');
    assert.equal(call.headers.authorization, req.headers.get('Authorization'), 'forwards the caller token as is');
    assert.deepEqual(call.body, { p_fn: 'recipe-import', p_limit: 10, p_window_seconds: 60 });
    assert.ok(!JSON.stringify(call.body).includes(USER_A), 'never sends an account id; the database reads auth.uid()');

    rpcReply = () => new Response('false', { status: 200 });
    assert.deepEqual(await limiter.take(userReq(USER_A), USER_A), { allowed: false, source: 'database' });

    // The database is the only counter while it answers: many allowed calls do not trip memory.
    rpcReply = () => new Response('true', { status: 200 });
    for (let i = 0; i < 15; i += 1) assert.equal((await limiter.take(userReq(USER_B), USER_B)).allowed, true);
  }
  console.log('ok   signed-in: database decides, caller token forwarded, no id in the request');

  // 4. Guests never call the database (it is signed-in only); in-memory per address.
  reset();
  env.SUPABASE_URL = 'https://project.supabase.test';
  env.SUPABASE_ANON_KEY = 'anon-key-test';
  {
    const limiter = createRateLimiter('viral-recipes', 2);
    const key = clientAddressKey(guestReq({ 'cf-connecting-ip': '1.2.3.4' }));
    const r = [];
    for (let i = 0; i < 3; i += 1) r.push((await limiter.take(guestReq({ 'cf-connecting-ip': '1.2.3.4' }), key)).allowed);
    assert.deepEqual(r, [true, true, false]);
    assert.equal(rpcCalls.length, 0);
    assert.equal(bearerWithUser(guestReq()), null);
    assert.equal(bearerWithUser(new Request('https://fn.test/')), null);
    assert.equal(bearerWithUser(userReq(USER_A))?.userId, USER_A);
  }
  console.log('ok   guests: in-memory per address, no database call');

  // 5. Guest address: platform headers win over a caller-supplied x-forwarded-for.
  {
    assert.equal(clientAddressKey(guestReq({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1', 'cf-connecting-ip': '1.2.3.4' })), 'ip:1.2.3.4');
    assert.equal(clientAddressKey(guestReq({ 'x-forwarded-for': '9.9.9.9', 'x-real-ip': '5.5.5.5' })), 'ip:5.5.5.5');
    assert.equal(clientAddressKey(guestReq({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1' })), 'ip:9.9.9.9');
    assert.equal(clientAddressKey(guestReq()), 'ip:unknown');
  }
  console.log('ok   guest address prefers cf-connecting-ip / x-real-ip over x-forwarded-for');

  // 6. Database function missing (functions deployed before the migration): in-memory, same limit.
  for (const [label, reply] of [
    ['not found', () => new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }), { status: 404 })],
    ['server error', () => new Response(JSON.stringify({ code: '57014' }), { status: 500 })],
    ['network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['odd answer', () => new Response('{"x":1}', { status: 200 })],
  ] as const) {
    reset();
    env.SUPABASE_URL = 'https://project.supabase.test';
    env.SUPABASE_ANON_KEY = 'anon-key-test';
    rpcReply = reply as () => Response;
    const limiter = createRateLimiter('pantry-vision', 3);
    const r = [];
    for (let i = 0; i < 4; i += 1) r.push(await limiter.take(userReq(USER_A), USER_A));
    assert.deepEqual(r.map((x) => x.allowed), [true, true, true, false], label);
    assert.ok(r.every((x) => x.source === 'memory'), label);
    assert.equal(warnings.length, 1, `${label}: warns once`);
    if (label === 'not found') assert.match(warnings[0], /take_rate_limit not found/);
  }
  console.log('ok   database function missing / failing: in-memory limit at the same number, one warning');

  // 7. Wiring: each function uses the shared limiter with today's number, keeps its 429 answer, and
  // no longer reads x-forwarded-for itself or keeps its own counter.
  const migration = fs.readFileSync(
    path.resolve(here, '..', '..', 'db', 'supabase', 'migrations', '20261016000000_ai_rate_limits.sql'),
    'utf8',
  );
  const wiring: Array<{ fn: string; limit: number; message: string }> = [
    { fn: 'pantry-vision', limit: 12, message: "'Too many pantry scans. Wait a minute and try again.'" },
    { fn: 'recipe-import', limit: 10, message: "'Too many recipe imports. Wait a minute and try again.'" },
    { fn: 'recipeapi-proxy', limit: 30, message: "'Too many recipe searches. Try again in a minute.'" },
    { fn: 'viral-recipes', limit: 40, message: "'Too many requests. Try again in a minute.'" },
  ];
  for (const { fn, limit, message } of wiring) {
    const source = fs.readFileSync(path.join(functionsDir, fn, 'index.ts'), 'utf8');
    assert.ok(source.includes(`createRateLimiter('${fn}', ${limit})`), `${fn}: shared limiter at ${limit}/min`);
    assert.ok(source.includes(message), `${fn}: 429 wording unchanged`);
    assert.ok(source.includes("code: 'RATE_LIMIT'"), `${fn}: RATE_LIMIT code unchanged`);
    assert.ok(!/x-forwarded-for/i.test(source), `${fn}: reads x-forwarded-for itself`);
    assert.ok(!/userHits|clientHits|checkUserRateLimit|checkClientRateLimit/.test(source), `${fn}: still has its own counter`);
    assert.ok(migration.includes(`'${fn}'`), `${fn}: name not accepted by take_rate_limit`);
  }
  console.log('ok   wiring: four functions use the shared limiter at 12/10/30/40 a minute, 429 answers unchanged');

  // 8. End to end through a real handler (recipeapi-proxy): a "false" from the database gives the
  // same 429 the app already handles; the upstream API is never called.
  reset();
  env.SUPABASE_URL = 'https://project.supabase.test';
  env.SUPABASE_ANON_KEY = 'anon-key-test';
  env.RECIPEAPI_KEY = 'recipeapi-test';
  await import('../functions/recipeapi-proxy/index.ts');
  assert.ok(served, 'recipeapi-proxy registered a handler');
  {
    const handler = served as unknown as Handler;
    let upstreamCalls = 0;
    otherFetch = (url) => {
      upstreamCalls += 1;
      assert.ok(url.startsWith('https://recipeapi.io/'), url);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };
    const call = (sub: string) =>
      handler(
        new Request('https://fn.test/', {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt({ sub, role: 'authenticated' })}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', query: { search: 'soup' } }),
        }),
      );

    rpcReply = () => new Response('false', { status: 200 });
    const refused = await call(USER_A);
    assert.equal(refused.status, 429);
    assert.deepEqual(await refused.json(), { error: 'Too many recipe searches. Try again in a minute.', code: 'RATE_LIMIT' });
    assert.equal(upstreamCalls, 0, 'refused before the paid API is called');
    assert.equal(rpcCalls.at(-1)?.body.p_fn, 'recipeapi-proxy');

    rpcReply = () => new Response('true', { status: 200 });
    const allowed = await call(USER_B);
    assert.equal(allowed.status, 200);
    assert.equal(upstreamCalls, 1);
    otherFetch = null;
  }
  console.log('ok   recipeapi-proxy: database refusal returns the same 429 RATE_LIMIT answer');

  console.warn = realWarn;
  console.log('rate-limit checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
