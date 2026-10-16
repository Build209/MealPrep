/// <reference types="node" />
// The Grocery list's row of store circles: which 3 stores it shows (favourites first, newest first,
// then the closest stores, no repeats, at most 3) and the badge drawn when there is no logo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio } from '../src/theme/contrast';
import { colors } from '../src/theme/tokens';
import type { FavoriteStore } from '../src/stores/favorites';
import type { Store } from '../src/stores/logic';
import { BADGE_COLORS, badgeColorsFor, normalizeChainKey, storeInitials } from '../src/stores/storeBadge';
import { favoritesForRow, hasSavedLocation, pickRowStores, showFindStores, STORE_ROW_SIZE } from '../src/stores/storeRow';

function fav(id: string, chain: string, sortOrder: number, name = chain): FavoriteStore {
  return { id, rowId: `row-${id}`, name, chain, sortOrder };
}

function store(id: string, chain: string, miles: number, extra: Partial<Store> = {}): Store {
  return {
    id,
    name: chain,
    chain,
    addressLine: '',
    city: 'Oakdale',
    state: 'CA',
    zip: '95361',
    distanceMiles: miles,
    source: 'catalog',
    pricingSource: 'none',
    knownBrand: true,
    ...extra,
  };
}

const keysOf = (rows: { key: string }[]) => rows.map((r) => r.key);
const idsOf = (rows: FavoriteStore[]) => rows.map((r) => r.id);

test('the row holds 3 stores', () => {
  assert.equal(STORE_ROW_SIZE, 3);
});

test('favourites come first, newest saved first', () => {
  const picked = pickRowStores({
    favorites: [fav('a', 'Safeway', 0), fav('b', 'Save Mart', 1)],
    chains: [store('n1', 'Walmart', 0.5)],
  });
  assert.deepEqual(keysOf(picked), ['b', 'a', 'n1']);
  assert.deepEqual(
    picked.map((p) => p.kind),
    ['favorite', 'favorite', 'nearby'],
  );
});

test('a 4th favourite stays saved but the row shows the 3 newest', () => {
  const favorites = [fav('a', 'Safeway', 0), fav('b', 'Save Mart', 1), fav('c', 'FoodMaxx', 2), fav('d', "Raley's", 3)];
  assert.deepEqual(idsOf(favoritesForRow(favorites)), ['d', 'c', 'b']);
  assert.deepEqual(keysOf(pickRowStores({ favorites, chains: [store('n1', 'Walmart', 0.1)] })), ['d', 'c', 'b']);
});

test('equal sort orders keep the saved order', () => {
  assert.deepEqual(idsOf(favoritesForRow([fav('a', 'A Mart', 0), fav('b', 'B Mart', 0)])), ['a', 'b']);
});

test('no favourites: the 3 closest chains, closest first, then local markets', () => {
  const picked = pickRowStores({
    favorites: [],
    chains: [store('far', 'Walmart', 4), store('near', 'Safeway', 1)],
    local: [store('farm', 'Wild Prairie Farm', 0.2, { knownBrand: false })],
  });
  assert.deepEqual(keysOf(picked), ['near', 'far', 'farm']);
  assert.ok(picked.every((p) => p.kind === 'nearby'));
});

test('a favourite is not shown twice, and a nearby store of a chain already shown is skipped', () => {
  const picked = pickRowStores({
    favorites: [fav('safeway-1', 'Safeway', 0)],
    chains: [store('safeway-1', 'Safeway', 0.4), store('safeway-2', 'Safeway', 0.6), store('tj', "Trader Joe's", 1)],
  });
  assert.deepEqual(keysOf(picked), ['safeway-1', 'tj']);
});

test('Kroger-family stores are matched by the favourite key (Kroger id)', () => {
  const picked = pickRowStores({
    favorites: [fav('k-42', 'Ralphs', 0)],
    chains: [store('osm-9', 'Ralphs', 0.3, { krogerLocationId: 'k-42' }), store('w', 'Walmart', 1)],
  });
  assert.deepEqual(keysOf(picked), ['k-42', 'w']);
});

test('never more than 3, and fewer when there is nothing to fill with', () => {
  const chains = ['A Mart', 'B Mart', 'C Mart', 'D Mart'].map((c, i) => store(`s${i}`, c, i));
  assert.equal(pickRowStores({ favorites: [], chains }).length, 3);
  assert.deepEqual(keysOf(pickRowStores({ favorites: [fav('x', 'Safeway', 0)] })), ['x']);
  assert.deepEqual(pickRowStores({ favorites: [] }), []);
});

test('the name under a circle is the chain, else the listing name', () => {
  const [first] = pickRowStores({ favorites: [fav('x', '', 0, 'Corner Pantry Co')] });
  assert.equal(first!.name, 'Corner Pantry Co');
});

test('location: only a chosen location counts, not the default ZIP', () => {
  assert.equal(hasSavedLocation({ kind: 'zip', zip: '95361', isDefault: true }), false);
  assert.equal(hasSavedLocation({ kind: 'zip', zip: '69201', isDefault: false }), true);
  assert.equal(hasSavedLocation({ kind: 'gps', lat: 44.5, lng: -110.6 }), true);
});

test('"Find stores" shows when the row has room and nothing is coming to fill it', () => {
  assert.equal(showFindStores(1, false, false), true);
  assert.equal(showFindStores(0, true, true), false); // nearby stores still loading
  assert.equal(showFindStores(2, true, false), true); // too few stores nearby
  assert.equal(showFindStores(3, false, false), false);
});

test('initials: first letters of the first two words', () => {
  assert.equal(storeInitials("Trader Joe's"), 'TJ');
  assert.equal(storeInitials('Grocery Outlet Bargain Market'), 'GO');
  assert.equal(storeInitials('Safeway'), 'S');
  assert.equal(storeInitials('The Fresh Market'), 'FM');
  assert.equal(storeInitials('  '), '?');
});

test('badge colour is stable per chain and ignores case and punctuation', () => {
  assert.deepEqual(badgeColorsFor('Safeway'), badgeColorsFor('Safeway'));
  assert.deepEqual(badgeColorsFor("Trader Joe's"), badgeColorsFor('TRADER JOES'.replace('JOES', "JOE'S")));
  assert.equal(normalizeChainKey("Trader Joe's"), 'trader joe s');
});

test('badge colours are theme colours with readable text, never tomato or danger', () => {
  for (const { bg, fg } of BADGE_COLORS) {
    assert.ok(!['tomato', 'tomatoDark', 'tomatoLight', 'danger'].includes(bg), `${bg} is not for decoration`);
    const ratio = contrastRatio(colors[fg], colors[bg]);
    assert.ok(ratio >= 4.5, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
  }
});
