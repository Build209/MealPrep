// Delivery (Instacart) links for store cards: src/stores/delivery.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROCERY_CHAINS } from '../src/stores/chains';
import { resolveDeliveryLink } from '../src/stores/delivery';
import { STORES_COPY } from '../src/stores/copy';

const ref = (name: string) => ({ name, chain: name });

test('chains with an Instacart store page link to it', () => {
  const cases: [string, string][] = [
    ['Safeway', 'https://www.instacart.com/store/safeway'],
    ['Save Mart', 'https://www.instacart.com/store/savemart'],
    ["Raley's", 'https://www.instacart.com/store/raleys'],
    ['Costco Wholesale', 'https://www.instacart.com/store/costco'],
    ['Smart & Final Extra!', 'https://www.instacart.com/store/smart-and-final'],
    ['Grocery Outlet Bargain Market', 'https://www.instacart.com/store/grocery-outlet'],
  ];
  for (const [name, url] of cases) {
    assert.deepEqual(resolveDeliveryLink(ref(name)), { url, service: 'Instacart' }, name);
  }
});

test('chains without a store page open an Instacart search for the chain name', () => {
  assert.equal(resolveDeliveryLink(ref('Walmart Supercenter'))?.url, 'https://www.instacart.com/store/s?k=Walmart');
  assert.equal(resolveDeliveryLink(ref('Target'))?.url, 'https://www.instacart.com/store/s?k=Target');
  assert.equal(resolveDeliveryLink(ref('Cost Less Foods'))?.url, 'https://www.instacart.com/store/s?k=Cost%20Less%20Foods');
});

test('no delivery link for Trader Joe\'s, Dollar General Market or stores outside the table', () => {
  assert.equal(resolveDeliveryLink(ref("Trader Joe's")), undefined);
  assert.equal(resolveDeliveryLink(ref('Dollar General Market')), undefined);
  assert.equal(resolveDeliveryLink(ref('Nilsson Farms')), undefined);
  assert.equal(resolveDeliveryLink(ref('')), undefined);
});

test('every link is an https instacart.com address and never carries anything but the chain', () => {
  for (const chain of GROCERY_CHAINS) {
    const link = resolveDeliveryLink(ref(chain.displayName));
    if (!link) continue;
    const url = new URL(link.url);
    assert.equal(url.protocol, 'https:', chain.key);
    assert.equal(url.hostname, 'www.instacart.com', chain.key);
    assert.equal(link.service, 'Instacart');
  }
});

test('the button wording says what the link does, with no partner or free-delivery claim', () => {
  assert.equal(STORES_COPY.delivery, 'Delivery (Instacart)');
  assert.doesNotMatch(STORES_COPY.delivery, /partner|free/i);
});
