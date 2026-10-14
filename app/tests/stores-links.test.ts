/// <reference types="node" />
// The weekly-ad link table (mobile/config/storeChains.ts), per-store ad links
// (mobile/lib/stores/storeLinks.ts), the Kroger location merge (krogerMerge.ts), favourite rows,
// and ZIP lookup from the built-in tables (no live service).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORE_CHAINS, resolveStoreChainConfig } from '../src/stores/chains';
import { favoriteFromRow, favoriteInsertColumns, nextSortOrder, placeholderFavorite } from '../src/stores/favorites';
import { favoriteStoreKey, krogerLocationsBody, mergeKrogerLocations, parseKrogerLocations, type KrogerLocationRow } from '../src/stores/kroger';
import { mapsDirectionsUrl, resolveWeeklyAdLink } from '../src/stores/links';
import { rowToStore, sortAndLimitStoresForStoresTab, type NearbyStoresRow, type Store } from '../src/stores/logic';
import { geocodeUsZip, lookupLocalZip } from '../src/stores/zipGeocode';

const ref = (name: string, extra: Partial<Store> = {}) => ({ name, chain: name, ...extra });

test('every chain in the table has an https weekly-ad link', () => {
  assert.equal(STORE_CHAINS.length, 32);
  for (const chain of STORE_CHAINS) {
    assert.match(chain.weeklyAdUrl ?? '', /^https:\/\//, chain.key);
  }
});

test('chain-wide weekly-ad links, as in the old app', () => {
  const cases: [string, string][] = [
    ['Save Mart', 'https://savemart.com/flyers'],
    ['FoodMaxx', 'https://foodmaxx.com/flyers'],
    ['Cost Less Foods', 'https://costlessfoods.com/weekly-ad/'],
    ["Raley's", 'https://www.raleys.com/weekly-ad'],
    ['Bel Air Market', 'https://www.raleys.com/weekly-ad'],
    ['Safeway', 'https://www.safeway.com/weeklyad'],
    ['Walmart Supercenter', 'https://www.walmart.com/shop/deals'],
    ['Target', 'https://www.target.com/weekly-ad'],
    ['WinCo Foods', 'https://www.wincofoods.com/weekly-ad'],
    ['Grocery Outlet Bargain Market', 'https://www.groceryoutlet.com/circulars'],
    ['Food 4 Less', 'https://www.myfood4less.com/store/food4less/pages/weekly-ad'],
    ['Ralphs', 'https://www.ralphs.com/weeklyad'],
    ['Costco Wholesale', 'https://www.costco.com/warehouse-savings.html'],
    ["Trader Joe's", 'https://www.traderjoes.com/home/flyer'],
    ['Smart & Final Extra!', 'https://www.smartandfinal.com/circular'],
    ['ALDI', 'https://www.aldi.us/weekly-specials'],
  ];
  for (const [name, url] of cases) {
    assert.deepEqual(resolveWeeklyAdLink(ref(name)), { url }, name);
  }
});

test('no weekly-ad link for stores outside the table', () => {
  assert.equal(resolveWeeklyAdLink(ref('Nilsson Farms')), undefined);
  assert.equal(resolveWeeklyAdLink(ref("O'Brien's Market")), undefined);
});

test('Food 4 Less: the Kroger-run store is not the NorCal chain', () => {
  const kroger = { ...ref('Food 4 Less'), krogerLocationId: '70300022', pricingSource: 'kroger' as const };
  assert.equal(resolveStoreChainConfig(kroger), null);
  assert.equal(resolveWeeklyAdLink(kroger), undefined);
});

test('per-store ad links from the store website', () => {
  assert.deepEqual(
    resolveWeeklyAdLink({ ...ref('Save Mart'), website: 'https://savemart.com/stores/0d6a1b2c-1234-4abc-9def-001122334455/SAVE-MART/52/OAKDALE' }),
    { url: 'https://savemart.com/stores/52/flyers', storeSpecific: true },
  );
  assert.deepEqual(resolveWeeklyAdLink({ ...ref('Grocery Outlet'), website: 'https://www.groceryoutlet.com/circulars/storeid/123' }), {
    url: 'https://www.groceryoutlet.com/circulars/storeid/123',
    storeSpecific: true,
  });
  // Safeway and Walmart store pages carry that store's ad.
  assert.deepEqual(resolveWeeklyAdLink({ ...ref('Safeway'), website: 'https://local.safeway.com/safeway/ca/oakdale/1-main.html' }), {
    url: 'https://local.safeway.com/safeway/ca/oakdale/1-main.html',
    storeSpecific: true,
  });
  assert.deepEqual(resolveWeeklyAdLink({ ...ref('Walmart'), website: 'walmart.com/store/2031-oakdale-ca' }), {
    url: 'https://walmart.com/store/2031-oakdale-ca',
    storeSpecific: true,
  });
  // Not a store page: the chain-wide link.
  assert.deepEqual(resolveWeeklyAdLink({ ...ref('Safeway'), website: 'https://www.safeway.com/store-locator.html' }), {
    url: 'https://www.safeway.com/weeklyad',
  });
  assert.deepEqual(resolveWeeklyAdLink({ ...ref('Walmart'), website: 'https://www.facebook.com/walmart/store/1' }), {
    url: 'https://www.walmart.com/shop/deals',
  });
});

test('directions: by position when known, else by address', () => {
  const store = { name: 'Save Mart', addressLine: '12 Main St', city: 'Oakdale', state: 'CA', zip: '95361' };
  assert.equal(mapsDirectionsUrl({ ...store, lat: 37.77, lng: -120.85 }), 'https://www.google.com/maps/dir/?api=1&destination=37.77,-120.85');
  assert.equal(
    mapsDirectionsUrl(store),
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Save Mart, 12 Main St, Oakdale, CA, 95361')}`,
  );
});

function catalogRow(partial: Partial<NearbyStoresRow> & Pick<NearbyStoresRow, 'id' | 'name'>): NearbyStoresRow {
  return {
    brand: null,
    category: null,
    address_line: '',
    city: '',
    state: '',
    zip: '',
    lat: 34.0,
    lng: -118.0,
    phone: null,
    website: null,
    opening_hours: null,
    sources: null,
    distance_m: 0,
    ...partial,
  };
}

const krogerRow = (partial: Partial<KrogerLocationRow> & Pick<KrogerLocationRow, 'id'>): KrogerLocationRow => ({
  name: 'Ralphs',
  chain: 'RALPHS',
  addressLine: '1 Ralphs Way',
  city: 'Town',
  state: 'CA',
  zip: '90001',
  lat: 34.0,
  lng: -118.0,
  ...partial,
});

test('Kroger merge: a nearby listing takes the Kroger id; unmatched Kroger stores are added', () => {
  const listing = rowToStore(catalogRow({ id: 'cat-1', name: 'Ralphs Fresh Fare', lat: 34.0, lng: -118.0 }));
  const merged = mergeKrogerLocations([listing], [krogerRow({ id: '70300001', lat: 34.001 }), krogerRow({ id: '70300002', lat: 34.05 })]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.id, 'cat-1');
  assert.equal(merged[0]!.krogerLocationId, '70300001');
  assert.equal(merged[0]!.pricingSource, 'kroger');
  assert.equal(merged[0]!.chain, 'RALPHS');
  assert.equal(merged[1]!.id, 'kroger-70300002');
  assert.equal(merged[1]!.source, 'kroger');
  assert.equal(favoriteStoreKey(merged[0]!), '70300001');
  assert.equal(favoriteStoreKey(listing), 'cat-1');
  // Kroger stores count as recognised chains and get the Ralphs weekly-ad link.
  const list = sortAndLimitStoresForStoresTab(merged, { lat: 34.0, lng: -118.0 });
  assert.equal(list.chains.length, 2);
  assert.deepEqual(resolveWeeklyAdLink(list.chains[1]!), { url: 'https://www.ralphs.com/weeklyad' });
});

test('Kroger merge: far rows do not match; nothing from Kroger leaves the list alone', () => {
  const listing = rowToStore(catalogRow({ id: 'cat-1', name: 'Save Mart' }));
  assert.deepEqual(mergeKrogerLocations([listing], []), [listing]);
  const merged = mergeKrogerLocations([listing], [krogerRow({ id: 'k', lat: 34.02 })]);
  assert.equal(merged[0]!.krogerLocationId, undefined);
  assert.equal(merged.length, 2);
});

test('kroger-deals request and answers', () => {
  assert.deepEqual(krogerLocationsBody({ lat: 44.5, lng: -110.6 }, undefined), {
    action: 'locations',
    lat: 44.5,
    lng: -110.6,
    zip: undefined,
    radiusMiles: 10,
  });
  assert.deepEqual(parseKrogerLocations(503, { configured: false, error: 'not set up' }), { rows: [], configured: false });
  assert.deepEqual(parseKrogerLocations(200, { configured: false }), { rows: [], configured: false });
  const ok = parseKrogerLocations(200, { configured: true, stores: [{ id: '1', name: 'Kroger', chain: 'KROGER', lat: 1, lng: 2 }, { name: 'no id' }, null] });
  assert.equal(ok.configured, true);
  assert.equal(ok.rows.length, 1);
  assert.equal(ok.rows[0]!.lat, 1);
  assert.throws(() => parseKrogerLocations(500, { error: 'boom' }));
});

test('favourite rows: store_key is the id, the old columns are written', () => {
  const store = rowToStore(catalogRow({ id: 'cat-9', name: 'Safeway', brand: 'Safeway', city: 'Oakdale', state: 'CA', zip: '95361' }));
  const cols = favoriteInsertColumns('user-1', store, 3);
  assert.deepEqual(cols, {
    user_id: 'user-1',
    store_key: 'cat-9',
    name: 'Safeway',
    chain: 'Safeway',
    address_line: '',
    city: 'Oakdale',
    state: 'CA',
    zip: '95361',
    lat: 34.0,
    lng: -118.0,
    kroger_location_id: null,
    source: 'osm',
    sort_order: 3,
  });
  const fav = favoriteFromRow({ ...cols, id: 'uuid-1', created_at: '2026-10-14T00:00:00Z' });
  assert.deepEqual(fav, { id: 'cat-9', rowId: 'uuid-1', name: 'Safeway', chain: 'Safeway', sortOrder: 3 });
  assert.equal(placeholderFavorite(store, 3).id, fav.id);
  assert.equal(nextSortOrder([]), 0);
  assert.equal(nextSortOrder([fav, { ...fav, id: 'b', sortOrder: 0 }]), 4);
});

test('ZIP lookup: built-in table first, then the ZCTA table; no live service', async () => {
  assert.deepEqual(lookupLocalZip('95361'), { lat: 37.7666, lng: -120.8472, label: 'Oakdale, CA' });
  let loads = 0;
  const load = async () => {
    loads += 1;
    return { '69201': [42.6917, -100.6176] as [number, number] };
  };
  assert.deepEqual(await geocodeUsZip('95361', load), { ok: true, point: { lat: 37.7666, lng: -120.8472, label: 'Oakdale, CA' } });
  assert.equal(loads, 0, 'home-area ZIPs need no table');
  assert.deepEqual(await geocodeUsZip(' 69201-1234', load), { ok: true, point: { lat: 42.6917, lng: -100.6176 } });
  assert.deepEqual(await geocodeUsZip('00000', load), { ok: false, reason: 'not_found' });
  assert.deepEqual(await geocodeUsZip('12ab', load), { ok: false, reason: 'invalid_zip' });
  assert.deepEqual(
    await geocodeUsZip('69201', async () => {
      throw new Error('offline');
    }),
    { ok: false, reason: 'network' },
  );
});
