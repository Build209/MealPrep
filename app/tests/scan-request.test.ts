/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScanner } from '../src/scan/api';
import { pantryImageContentHash, fallbackHashHex } from '../src/scan/imageHash';
import type { PreparedImage } from '../src/scan/prepareShared';
import {
  buildScanBody,
  buildScanRequest,
  pantryVisionUrl,
  parseScanResponse,
  scanErrorFromResponse,
  ScanError,
  SCAN_MESSAGES,
} from '../src/scan/request';

const prepared: PreparedImage = {
  uri: 'data:image/jpeg;base64,AAAA',
  mimeType: 'image/jpeg',
  base64: 'QUJDRA==',
  byteLength: 4,
  qualityWarnings: [],
  detailTiles: [],
};

test('function address is <supabase url>/functions/v1/pantry-vision', () => {
  assert.equal(pantryVisionUrl('https://abc.supabase.co/'), 'https://abc.supabase.co/functions/v1/pantry-vision');
  assert.equal(pantryVisionUrl('http://127.0.0.1:54321'), 'http://127.0.0.1:54321/functions/v1/pantry-vision');
  assert.equal(pantryVisionUrl(''), '');
});

test('shelf request: same body and headers as the old app', () => {
  const init = buildScanRequest({ prepared, imageHash: 'h1', kind: 'shelf', place: 'fridge' }, 'token-123');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' });
  // JSON drops undefined fields, as in the old app: no action for a shelf, no tiles when none.
  assert.deepEqual(JSON.parse(init.body), { imageBase64: 'QUJDRA==', mimeType: 'image/jpeg', location: 'fridge', imageHash: 'h1' });
});

test('receipt request sends action "receipt" and the zoomed strips', () => {
  const body = buildScanBody({
    prepared: { ...prepared, detailTiles: [{ mimeType: 'image/jpeg', base64: 'Zm9v', byteLength: 3, position: 'top' }] },
    imageHash: 'h2',
    kind: 'receipt',
    place: 'pantry',
  });
  assert.equal(body.action, 'receipt');
  assert.deepEqual(body.tiles, [{ imageBase64: 'Zm9v', mimeType: 'image/jpeg', position: 'top' }]);
});

test('response rows are checked like the function does', () => {
  const result = parseScanResponse({
    items: [
      { name: ' black beans ', quantity: 2, unit: 'can', category: 'dry_goods', storage: 'pantry', confidence: 0.9 },
      { name: 'milk', quantity: 0, unit: '', category: 'nonsense', storage: 'Fridge', confidence: 7 },
      { name: '', quantity: 1 },
      'junk',
    ],
    model: 'gemini-3.8-flash',
    usage: { isPlus: false, tier: 'free', limit: 3, remaining: 2 },
    kind: 'pantry',
    cached: false,
    itemCount: 2,
  });
  assert.deepEqual(result.items, [
    { name: 'black beans', quantity: 2, unit: 'can', category: 'dry_goods', storage: 'pantry', confidence: 0.9 },
    { name: 'milk', quantity: 1, unit: 'each', category: 'dry_goods', storage: 'fridge', confidence: 1 },
  ]);
  assert.deepEqual(result.usage, { isPlus: false, tier: 'free', limit: 3, remaining: 2 });
  assert.throws(() => parseScanResponse({ error: 'x' }), ScanError);
});

test('error answers become plain messages', () => {
  const free = scanErrorFromResponse(
    403,
    JSON.stringify({
      error: 'You have used your 3 free scans for this month. They reset on the 1st. A paid plan includes more.',
      code: 'PLAN_REQUIRED',
      usage: { remaining: 0, limit: 3, isPlus: false, tier: 'free' },
    }),
  );
  assert.equal(free.kind, 'used-up');
  assert.match(free.message, /used your 3 free scans/);
  assert.equal(free.usage?.remaining, 0);

  const paid = scanErrorFromResponse(429, JSON.stringify({ error: 'You have used all 15 photo scans for this month. They reset on the 1st.', code: 'SCAN_LIMIT_REACHED' }));
  assert.equal(paid.kind, 'used-up');
  assert.equal(scanErrorFromResponse(429, JSON.stringify({ error: 'Too many', code: 'RATE_LIMIT' })).kind, 'rate-limit');
  assert.equal(scanErrorFromResponse(503, JSON.stringify({ error: 'x', code: 'UPSTREAM_BUSY' })).message, SCAN_MESSAGES.stillScanning);
  assert.equal(scanErrorFromResponse(503, JSON.stringify({ error: 'x', code: 'SCAN_UNAVAILABLE' })).kind, 'unavailable');
  assert.equal(scanErrorFromResponse(503, JSON.stringify({ code: 'NOT_CONFIGURED' })).kind, 'unavailable');
  assert.equal(scanErrorFromResponse(502, JSON.stringify({ error: 'Pantry scan could not reach Gemini', code: 'UPSTREAM_ERROR' })).message, SCAN_MESSAGES.busy);
  assert.equal(scanErrorFromResponse(401, '{"error":"Sign in required","code":"UNAUTHENTICATED"}').kind, 'signed-out');
  assert.equal(scanErrorFromResponse(413, '{"code":"PAYLOAD_TOO_LARGE"}').kind, 'bad-image');
  assert.equal(scanErrorFromResponse(404, 'Not found').kind, 'unavailable');
  assert.equal(scanErrorFromResponse(500, '<html>').kind, 'unexpected');
  // Raw upstream wording (model names, vendor errors) never reaches the screen.
  assert.doesNotMatch(scanErrorFromResponse(502, '{"error":"gemini-3.8-flash (500): boom","code":"UPSTREAM_ERROR"}').message, /gemini/i);
});

test('image hash is stable and matches the old app (sha-256 of "mime|base64")', async () => {
  const a = await pantryImageContentHash('QUJDRA==', 'image/jpeg');
  assert.equal(a, await pantryImageContentHash('QUJDRA==', 'image/jpeg'));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await pantryImageContentHash('QUJDRA==', 'image/png'));
  assert.match(fallbackHashHex('x'), /^[0-9a-f]{16}$/);
});

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };

function fakeFetch(respond: (call: Call) => Promise<{ status: number; body: string }>) {
  const calls: Call[] = [];
  const impl = async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    const r = await respond({ url, init });
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body };
  };
  return { impl, calls };
}

const okBody = JSON.stringify({ items: [{ name: 'rice', quantity: 1, unit: 'bag', category: 'dry_goods', storage: 'pantry', confidence: 0.8 }], model: 'm' });

test('scanner sends one request with the token; a repeat while running shares it', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const { impl, calls } = fakeFetch(async () => {
    await gate;
    return { status: 200, body: okBody };
  });
  const scan = createScanner({ url: 'http://127.0.0.1:54321/functions/v1/pantry-vision', fetchImpl: impl });
  const first = scan({ prepared, kind: 'shelf', place: 'pantry', accessToken: 'tok' });
  const second = scan({ prepared, kind: 'shelf', place: 'pantry', accessToken: 'tok' });
  await new Promise((r) => setTimeout(r, 20));
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls.length, 1, 'double tap: one request');
  assert.equal(calls[0]!.init.headers.Authorization, 'Bearer tok');
  assert.match(JSON.parse(calls[0]!.init.body).imageHash, /^[0-9a-f]{64}$/);
  assert.equal(a.items[0]!.name, 'rice');
  assert.deepEqual(a, b);
});

test('scanner: signed out, not configured, network failure and timeout', async () => {
  const { impl } = fakeFetch(async () => ({ status: 200, body: okBody }));
  await assert.rejects(createScanner({ url: 'x', fetchImpl: impl })({ prepared, kind: 'shelf', place: 'pantry', accessToken: null }), { kind: 'signed-out' });
  await assert.rejects(createScanner({ url: '', fetchImpl: impl })({ prepared, kind: 'shelf', place: 'pantry', accessToken: 't' }), { kind: 'unavailable' });

  const down = createScanner({ url: 'x', fetchImpl: async () => Promise.reject(new TypeError('Failed to fetch')) });
  await assert.rejects(down({ prepared, kind: 'shelf', place: 'pantry', accessToken: 't' }), { kind: 'network', message: SCAN_MESSAGES.network });

  const slow = createScanner({ url: 'x', timeoutMs: 30, fetchImpl: () => new Promise(() => {}) });
  await assert.rejects(slow({ prepared, kind: 'shelf', place: 'pantry', accessToken: 't' }), { kind: 'timeout', message: SCAN_MESSAGES.timeout });

  const limited = createScanner({
    url: 'x',
    fetchImpl: fakeFetch(async () => ({ status: 429, body: JSON.stringify({ error: 'You have used all 15 photo scans for this month. They reset on the 1st.', code: 'SCAN_LIMIT_REACHED' }) })).impl,
  });
  await assert.rejects(limited({ prepared, kind: 'receipt', place: 'pantry', accessToken: 't' }), { kind: 'used-up' });
});
