/**
 * Stores tab asked the deals function for nearby stores twice per load (testing T-16).
 * One request per place is shared and its answer reused for a few minutes.
 * Run: npx tsx scripts/kroger-locations-dedupe-check.ts
 */
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
import assert from 'node:assert/strict';

async function main() {
  const { fetchKrogerLocations, krogerLocationsKey, resetKrogerLocationsMemory, KROGER_LOCATIONS_REUSE_MS } = await import(
    '../lib/deals/krogerClient'
  );

  let calls = 0;
  let nextStatus = 200;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (nextStatus === 503) return new Response(JSON.stringify({ error: 'not set up' }), { status: 503 });
    return new Response(JSON.stringify({ stores: [{ id: 's1', name: 'Store', chain: 'Kroger', addressLine: '', city: '', state: '', zip: '' }] }), { status: 200 });
  }) as typeof fetch;

  try {
    let clock = 1_000_000;
    const now = () => clock;
    const here = { lat: 37.76661, lng: -120.84712, radiusMiles: 10 };

    resetKrogerLocationsMemory();
    const [a, b] = await Promise.all([fetchKrogerLocations(here, now), fetchKrogerLocations(here, now)]);
    assert.equal(calls, 1, 'two parts of the screen asking at once share one request');
    assert.deepEqual(a, b);
    assert.equal(a.stores.length, 1);

    await fetchKrogerLocations({ ...here, lat: 37.76664 }, now);
    assert.equal(calls, 1, 'the same place a few metres off reuses the answer');
    assert.equal(krogerLocationsKey(here), krogerLocationsKey({ ...here, lat: 37.76664 }));

    await fetchKrogerLocations({ lat: 38.5, lng: -121.4, radiusMiles: 10 }, now);
    assert.equal(calls, 2, 'a different place asks again');

    clock += KROGER_LOCATIONS_REUSE_MS + 1;
    await fetchKrogerLocations(here, now);
    assert.equal(calls, 3, 'after a few minutes the server is asked again');

    // A "not set up" or failed answer is never remembered.
    resetKrogerLocationsMemory();
    nextStatus = 503;
    const down = await fetchKrogerLocations(here, now);
    assert.equal(down.serverConfigured, false);
    nextStatus = 200;
    const up = await fetchKrogerLocations(here, now);
    assert.equal(up.serverConfigured, true, 'the next ask goes to the server');
    assert.equal(calls, 5);
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log('kroger-locations-dedupe-check: ok');
}

void main();
