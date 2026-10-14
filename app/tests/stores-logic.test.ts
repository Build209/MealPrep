/// <reference types="node" />
// Cases from the old app's mobile/scripts/stores-nearby-pipeline-check.ts (chains first, the
// per-group trim, the name filter) and stores-search-check.ts (search radius), plus distance,
// address and search-origin rules from mobile/lib/stores/*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORES,
  filterStoresList,
  formatDistanceMiles,
  formatStoreAddress,
  isRecognizedStore,
  nearbyStoreSearchRadiusMeters,
  roundCoordsForPrivacy,
  rowToStore,
  searchOriginFromProfile,
  selectNearbyCatalogStores,
  shouldAutoLocate,
  shouldShowLocationPrompt,
  sortAndLimitStoresForStoresTab,
  splitStoresByRecognition,
  type NearbyStoresRow,
  type Store,
} from '../src/stores/logic';

function catalogRow(partial: Partial<NearbyStoresRow> & Pick<NearbyStoresRow, 'id' | 'name' | 'distance_m'>): NearbyStoresRow {
  return {
    brand: null,
    category: 'grocery_store',
    address_line: '',
    city: 'Stockton',
    state: 'CA',
    zip: '95215',
    lat: 37.9,
    lng: -121.15,
    phone: null,
    website: null,
    opening_hours: null,
    sources: null,
    ...partial,
  };
}

// Shapes taken from the live table near Stockton and Oakdale on 2026-10-09 (old check).
const farm = rowToStore(catalogRow({ id: 'farm', name: 'Nilsson Farms', distance_m: 2700, lat: 37.92 }));
const dairy = rowToStore(catalogRow({ id: 'dairy', name: 'E & R Prins Dairy', distance_m: 8800, lat: 37.96 }));
const traderJoes = rowToStore(catalogRow({ id: 'tj', name: "Trader Joe's", brand: "Trader Joe's", distance_m: 8400, lat: 37.98, lng: -121.2 }));
const costcoNoBrand = rowToStore(catalogRow({ id: 'costco', name: 'Costco Wholesale', distance_m: 11700, lat: 38.02 }));
const brandedLocal = rowToStore(catalogRow({ id: 'obriens', name: "O'Brien's Market", brand: "O'Brien's Market", distance_m: 2400 }));
const closedChain = rowToStore(catalogRow({ id: 'fresh-easy', name: 'Fresh & Easy Neighborhood Market', distance_m: 14800 }));

test('recognition: brands and known chains count, farms and Fresh & Easy do not', () => {
  assert.ok(!isRecognizedStore(farm) && !isRecognizedStore(dairy));
  assert.ok(isRecognizedStore(traderJoes));
  assert.ok(isRecognizedStore(costcoNoBrand), 'known chain without a brand on the row');
  assert.equal(costcoNoBrand.chain, 'Costco');
  assert.ok(isRecognizedStore(brandedLocal), 'a row with a brand');
  assert.notEqual(closedChain.chain, 'Walmart');
  assert.ok(!isRecognizedStore(closedChain));
  assert.ok(isRecognizedStore({ name: 'Kroger', chain: 'Kroger', source: 'kroger', krogerLocationId: '70300022' }));
});

test('rowToStore: metres to miles, brand as chain, website trimmed', () => {
  const s = rowToStore(catalogRow({ id: 'x', name: 'Joe Corner', brand: ' Joe Brand ', distance_m: 1609.344, website: ' https://a.example/ ' }));
  assert.equal(s.distanceMiles, 1);
  assert.equal(s.chain, 'Joe Brand');
  assert.equal(s.website, 'https://a.example/');
  assert.equal(s.source, 'catalog');
  assert.equal(s.pricingSource, 'none');
});

test('chains first: nearest recognised store leads even though a farm is closer', () => {
  const origin = { lat: 37.9, lng: -121.15 };
  const list = sortAndLimitStoresForStoresTab([farm, dairy, traderJoes, costcoNoBrand], origin);
  assert.deepEqual(list.chains.map((s) => s.id), ['tj', 'costco']);
  assert.deepEqual(list.local.map((s) => s.id), ['farm', 'dairy']);
  const { recognized } = splitStoresByRecognition([...list.chains, ...list.local]);
  assert.equal(recognized.length, 2);
});

test('chains first: limits per group, distances measured from the origin', () => {
  const origin = { lat: 37.9, lng: -121.15 };
  const chains: Store[] = Array.from({ length: 20 }, (_, i) =>
    rowToStore(catalogRow({ id: `sm-${i}`, name: 'Save Mart', distance_m: 0, lat: 37.9 + (20 - i) * 0.01 })),
  );
  const list = sortAndLimitStoresForStoresTab(chains, origin);
  assert.equal(list.chains.length, STORES.displayLimit);
  assert.equal(list.chains[0]!.id, 'sm-19', 'closest by the origin, not by the row');
  for (let i = 1; i < list.chains.length; i++) {
    assert.ok((list.chains[i]!.distanceMiles ?? 0) >= (list.chains[i - 1]!.distanceMiles ?? 0));
  }
});

test('the fetch keeps a supermarket behind 150 unbranded rows', () => {
  const crowded: Store[] = [
    ...Array.from({ length: 150 }, (_, i) => rowToStore(catalogRow({ id: `junk-${i}`, name: `Corner Listing ${i}`, distance_m: 100 + i }))),
    rowToStore(catalogRow({ id: 'far-savemart', name: 'Save Mart', brand: 'Save Mart', distance_m: 9000 })),
  ];
  const kept = selectNearbyCatalogStores(crowded);
  assert.ok(kept.some((s) => s.id === 'far-savemart'));
  assert.equal(kept.length, STORES.keepPerGroup + 1);
  assert.equal(kept[0]!.id, 'junk-0', 'nearest-first order kept');
});

test('blocklisted names are dropped, known chains always pass', () => {
  assert.equal(selectNearbyCatalogStores([rowToStore(catalogRow({ id: 's', name: 'Valley Smoke Shop', distance_m: 50 }))]).length, 0);
  assert.equal(selectNearbyCatalogStores([rowToStore(catalogRow({ id: 'c', name: 'Chevron', distance_m: 50 }))]).length, 0);
  assert.equal(selectNearbyCatalogStores([rowToStore(catalogRow({ id: 'd', name: 'Dollar General Market', distance_m: 50 }))]).length, 1);
  const list = sortAndLimitStoresForStoresTab([rowToStore(catalogRow({ id: 'cvs', name: 'CVS Pharmacy', distance_m: 10 }))], { lat: 37.9, lng: -121.15 });
  assert.equal(list.chains.length + list.local.length, 0);
});

test('distance formatting: one decimal, always', () => {
  assert.equal(formatDistanceMiles(0), '0.0 mi');
  assert.equal(formatDistanceMiles(1.24), '1.2 mi');
  assert.equal(formatDistanceMiles(1.25), '1.3 mi');
  assert.equal(formatDistanceMiles(12), '12.0 mi');
  assert.equal(formatDistanceMiles(0.04), '0.0 mi');
});

test('address: street with town and ZIP, else town and ZIP', () => {
  assert.equal(formatStoreAddress({ addressLine: '12 Main St', city: 'Oakdale', state: 'CA', zip: '95361' }), '12 Main St, Oakdale CA 95361');
  assert.equal(formatStoreAddress({ addressLine: 'Address not listed', city: 'Oakdale', state: 'CA', zip: '95361' }), 'Oakdale, CA 95361');
  assert.equal(formatStoreAddress({ addressLine: '', city: '', state: '', zip: '95361' }), '95361');
  assert.equal(formatStoreAddress({ addressLine: '', city: 'Oakdale', state: 'CA', zip: '' }), 'Oakdale, CA');
});

test('search box matches name, chain, town or street in both groups', () => {
  const list = { chains: [traderJoes, costcoNoBrand], local: [farm] };
  assert.deepEqual(filterStoresList(list, 'cost').chains.map((s) => s.id), ['costco']);
  assert.deepEqual(filterStoresList(list, 'NILSSON').local.map((s) => s.id), ['farm']);
  assert.equal(filterStoresList(list, '  '), list);
});

test('search radius and privacy rounding (old values)', () => {
  assert.equal(nearbyStoreSearchRadiusMeters({ isGpsOrigin: false }), 24000);
  assert.equal(nearbyStoreSearchRadiusMeters({ isGpsOrigin: true }), 16000);
  assert.equal(nearbyStoreSearchRadiusMeters({ isGpsOrigin: true, radiusMultiplier: 2 }), 32000);
  assert.deepEqual(roundCoordsForPrivacy(37.76659, -120.84721), { lat: 37.77, lng: -120.85 });
  assert.deepEqual(roundCoordsForPrivacy(44.5012, -110.6013), { lat: 44.5, lng: -110.6 });
});

test('search origin: saved coordinates, else saved ZIP, else the default ZIP', () => {
  assert.deepEqual(searchOriginFromProfile({ homeZip: '95361', homeLat: 37.77, homeLng: -120.85 }), { kind: 'gps', lat: 37.77, lng: -120.85 });
  assert.deepEqual(searchOriginFromProfile({ homeZip: '69201', homeLat: null, homeLng: null }), { kind: 'zip', zip: '69201', isDefault: false });
  assert.deepEqual(searchOriginFromProfile({ homeZip: 'abc', homeLat: null, homeLng: null }), { kind: 'zip', zip: '95361', isDefault: true });
  assert.deepEqual(searchOriginFromProfile(null), { kind: 'zip', zip: STORES.defaultZip, isDefault: true });
});

test('location card and auto-locate', () => {
  const fresh = searchOriginFromProfile(null);
  const zip = searchOriginFromProfile({ homeZip: '69201', homeLat: null, homeLng: null });
  const gps = searchOriginFromProfile({ homeZip: null, homeLat: 1, homeLng: 2 });
  assert.equal(shouldShowLocationPrompt(fresh, null), false, 'not before the permission is known');
  assert.equal(shouldShowLocationPrompt(fresh, 'prompt'), true);
  assert.equal(shouldShowLocationPrompt(fresh, 'denied'), true);
  assert.equal(shouldShowLocationPrompt(fresh, 'granted'), false, 'locates on its own');
  assert.equal(shouldShowLocationPrompt(zip, 'prompt'), false);
  assert.equal(shouldShowLocationPrompt(gps, 'denied'), false);
  assert.equal(shouldAutoLocate(fresh, 'granted'), true);
  assert.equal(shouldAutoLocate(gps, 'granted'), true);
  assert.equal(shouldAutoLocate(zip, 'granted'), false, 'a chosen ZIP is respected');
  assert.equal(shouldAutoLocate(fresh, 'prompt'), false);
});
