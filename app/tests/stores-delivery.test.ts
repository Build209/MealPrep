// Store links for the Stores page and the row circles: src/stores/delivery.ts, storeRow.ts (shopTargetFor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORE_CHAINS } from '../src/stores/chains';
import {
  resolveShopUrl,
  resolveStoreActions,
  STORE_ACTION_LABELS,
} from '../src/stores/delivery';
import { ORDER_ONLINE_SERVICES } from '../src/stores/orderOnline';
import { pickRowStores, shopTargetFor } from '../src/stores/storeRow';
import { STORES_COPY } from '../src/stores/copy';

const ids = (name: string, link?: string | null) => resolveStoreActions({ name, link }).map((a) => a.id);

test('resolveStoreActions: order is flyer, shop, with the agreed labels', () => {
  const actions = resolveStoreActions({ key: 'k1', name: 'Safeway' });
  assert.deepEqual(
    actions.map((a) => [a.id, a.label]),
    [
      ['flyer', 'Weekly ad'],
      ['shop', 'Shop online'],
    ],
  );
  assert.equal(actions[0]!.url, 'https://www.safeway.com/weeklyad');
  assert.equal(actions[1]!.url, 'https://www.safeway.com/');
  assert.deepEqual(STORE_ACTION_LABELS, { flyer: 'Weekly ad', shop: 'Shop online' });
});

test('resolveStoreActions: an unknown store has Shop online only from its own website', () => {
  assert.deepEqual(ids('Joes Corner Market'), []);
  assert.deepEqual(ids('Joes Corner Market', 'https://joes.example/'), ['shop']);
  assert.deepEqual(ids('Joes Corner Market', 'joes.example'), ['shop']);
  // Maps, social and junk addresses are not a shop page.
  assert.deepEqual(ids('Joes Corner Market', 'https://www.facebook.com/joes'), []);
  assert.deepEqual(ids('Joes Corner Market', 'not a url'), []);
  assert.deepEqual(ids('Joes Corner Market', null), []);
});

test('Order online section: three services, plain https links, neutral wording', () => {
  assert.deepEqual(
    ORDER_ONLINE_SERVICES.map((s) => [s.testID, s.label, s.url]),
    [
      ['order-online-doordash', 'Order from DoorDash', 'https://www.doordash.com/'],
      ['order-online-instacart', 'Order from Instacart', 'https://www.instacart.com/'],
      ['order-online-walmart', 'Order from Walmart', 'https://www.walmart.com/cp/grocery/976759'],
    ],
  );
  for (const s of ORDER_ONLINE_SERVICES) {
    const u = new URL(s.url);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.search, '', `${s.id}: no tags or tracking`);
    assert.doesNotMatch(s.label, /partner|free|save|%|\$/i);
  }
  assert.equal(STORES_COPY.orderOnlineHeading, 'Order online');
  assert.equal(STORES_COPY.orderOnlineButton, 'Order online');
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
