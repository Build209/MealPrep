// Store links for the Stores page and the row circles: src/stores/delivery.ts, storeRow.ts (shopTargetFor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROCERY_CHAINS, STORE_CHAINS } from '../src/stores/chains';
import {
  resolveDeliveryLink,
  resolveDoorDashLink,
  resolveShopUrl,
  resolveStoreActions,
  STORE_ACTION_LABELS,
} from '../src/stores/delivery';
import { pickRowStores, shopTargetFor } from '../src/stores/storeRow';
import { STORES_COPY } from '../src/stores/copy';

const ref = (name: string) => ({ name, chain: name });
const ids = (name: string, link?: string | null) => resolveStoreActions({ name, link }).map((a) => a.id);

test('Instacart: chains with a store page link to it', () => {
  const cases: [string, string][] = [
    ['Safeway', 'https://www.instacart.com/store/safeway'],
    ['Save Mart', 'https://www.instacart.com/store/savemart'],
    ["Raley's", 'https://www.instacart.com/store/raleys'],
    ['Costco Wholesale', 'https://www.instacart.com/store/costco'],
    ['Smart & Final Extra!', 'https://www.instacart.com/store/smart-and-final'],
    ['Grocery Outlet Bargain Market', 'https://www.instacart.com/store/grocery-outlet'],
  ];
  for (const [name, url] of cases) assert.deepEqual(resolveDeliveryLink(ref(name)), { url, service: 'Instacart' }, name);
});

test('Instacart: other chains and unknown stores open a search for the name', () => {
  assert.equal(resolveDeliveryLink(ref('Walmart Supercenter'))?.url, 'https://www.instacart.com/store/s?k=Walmart');
  assert.equal(resolveDeliveryLink(ref('Cost Less Foods'))?.url, 'https://www.instacart.com/store/s?k=Cost%20Less%20Foods');
  assert.equal(resolveDeliveryLink(ref('Joes Corner Market'))?.url, 'https://www.instacart.com/store/s?k=Joes%20Corner%20Market');
});

test('DoorDash: a search for the chain (or store) name, never a guessed store slug', () => {
  assert.deepEqual(resolveDoorDashLink(ref('Safeway')), { url: 'https://www.doordash.com/search/store/Safeway/', service: 'DoorDash' });
  assert.equal(resolveDoorDashLink(ref('Smart & Final Extra!'))?.url, 'https://www.doordash.com/search/store/Smart%20%26%20Final/');
  assert.equal(resolveDoorDashLink(ref('Joes Corner Market'))?.url, 'https://www.doordash.com/search/store/Joes%20Corner%20Market/');
  for (const chain of GROCERY_CHAINS) {
    const url = resolveDoorDashLink(ref(chain.displayName))?.url;
    if (url) assert.match(url, /^https:\/\/www\.doordash\.com\/search\/store\/[^/]+\/$/, chain.key);
  }
});

test("Trader Joe's gets no delivery links; Dollar General Market gets DoorDash but not Instacart", () => {
  assert.equal(resolveDeliveryLink(ref("Trader Joe's")), undefined);
  assert.equal(resolveDoorDashLink(ref("Trader Joe's")), undefined);
  assert.equal(resolveDeliveryLink(ref('Dollar General Market')), undefined);
  assert.ok(resolveDoorDashLink(ref('Dollar General Market')));
});

test('resolveStoreActions: order is flyer, shop, Instacart, DoorDash, with the agreed labels', () => {
  const actions = resolveStoreActions({ key: 'k1', name: 'Safeway' });
  assert.deepEqual(
    actions.map((a) => [a.id, a.label]),
    [
      ['flyer', 'Weekly ad'],
      ['shop', 'Shop online'],
      ['instacart', 'Order with Instacart'],
      ['doordash', 'Order with DoorDash'],
    ],
  );
  assert.equal(actions[0]!.url, 'https://www.safeway.com/weeklyad');
  assert.equal(actions[1]!.url, 'https://www.safeway.com/');
  assert.deepEqual(STORE_ACTION_LABELS, { flyer: 'Weekly ad', shop: 'Shop online', instacart: 'Order with Instacart', doordash: 'Order with DoorDash' });
});

test('resolveStoreActions: an unknown store has Instacart and DoorDash search links, plus Shop online from its own website', () => {
  assert.deepEqual(ids('Joes Corner Market'), ['instacart', 'doordash']);
  assert.deepEqual(ids('Joes Corner Market', 'https://joes.example/'), ['shop', 'instacart', 'doordash']);
  assert.deepEqual(ids('Joes Corner Market', 'joes.example'), ['shop', 'instacart', 'doordash']);
  // Maps, social and junk addresses are not a shop page.
  assert.deepEqual(ids('Joes Corner Market', 'https://www.facebook.com/joes'), ['instacart', 'doordash']);
  assert.deepEqual(ids('Joes Corner Market', 'not a url'), ['instacart', 'doordash']);
  assert.deepEqual(ids('Joes Corner Market', null), ['instacart', 'doordash']);
});

test("resolveStoreActions: the store's own page picks its own weekly ad", () => {
  const actions = resolveStoreActions({
    name: 'Save Mart',
    link: 'https://savemart.com/stores/0a1b2c3d-0000-4000-8000-000000000000/SAVE%20MART/123/MODESTO',
  });
  assert.equal(actions[0]!.id, 'flyer');
  assert.equal(actions[0]!.url, 'https://savemart.com/stores/123/flyers');
});

test('every action is a plain https link: no tags, no wording that implies a partnership', () => {
  for (const chain of STORE_CHAINS) {
    for (const a of resolveStoreActions({ name: chain.displayName })) {
      const u = new URL(a.url);
      assert.equal(u.protocol, 'https:', chain.key);
      for (const bad of ['aff', 'ref', 'utm', 'partner', 'tag', 'cid']) {
        assert.ok(![...u.searchParams.keys()].some((k) => k.toLowerCase().startsWith(bad)), `${chain.key} ${a.url}`);
      }
    }
  }
  const words = Object.values(STORE_ACTION_LABELS).join(' ').toLowerCase();
  for (const bad of ['partner', 'free', 'save', '%', '$']) assert.ok(!words.includes(bad), bad);
});

test('shop pages are https and Walmart has one', () => {
  for (const chain of STORE_CHAINS) {
    if (chain.shopUrl) assert.match(chain.shopUrl, /^https:\/\//, chain.key);
  }
  assert.equal(resolveShopUrl({ name: 'Walmart Supercenter' }), 'https://www.walmart.com/');
});

test('row circle: opens the weekly flyer; with no flyer the shop page; with neither the Stores view', () => {
  const [safeway] = pickRowStores({ favorites: [{ id: 'k1', rowId: 'r1', name: 'Safeway', chain: 'Safeway', sortOrder: 0 }] });
  assert.deepEqual(shopTargetFor(safeway!), { kind: 'weekly-ad', url: 'https://www.safeway.com/weeklyad', thirdParty: false });

  const noAd = { ...safeway!, key: 'loc-1', link: { name: 'Joes Corner Market', chain: 'Joes Corner Market', website: 'https://joes.example/' } };
  assert.deepEqual(shopTargetFor(noAd), { kind: 'shop', url: 'https://joes.example/' });

  const nothing = { ...noAd, link: { name: 'Joes Corner Market', chain: 'Joes Corner Market' } };
  assert.deepEqual(shopTargetFor(nothing), { kind: 'stores', key: 'loc-1' });
});

test('row circle labels say what the tap does', () => {
  assert.equal(STORES_COPY.rowStoreA11y('Safeway', true, 'weekly-ad'), 'Safeway, favourite. Weekly ad');
  assert.equal(STORES_COPY.rowStoreA11y('Safeway', false, 'weekly-ad', true), 'Safeway, nearby. Weekly ad (third-party)');
  assert.equal(STORES_COPY.rowStoreA11y('Joes', false, 'shop'), 'Joes, nearby. Shop online');
  assert.equal(STORES_COPY.rowStoreA11y('Joes', false, 'stores'), 'Joes, nearby. Open in Stores');
});
