/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionSaved, splitActions } from '../src/stores/cardLogic';
import { resolveStoreActions, type StoreAction } from '../src/stores/delivery';

const a = (id: StoreAction['id']): StoreAction => ({ id, label: id, url: `https://example.com/${id}` });

test('the weekly ad is the main button, the rest are secondary', () => {
  const { primary, secondary } = splitActions([a('flyer'), a('shop'), a('instacart'), a('doordash')]);
  assert.equal(primary?.id, 'flyer');
  assert.deepEqual(secondary.map((x) => x.id), ['shop', 'instacart', 'doordash']);
});

test('no weekly ad: Shop online leads; neither: no main button', () => {
  assert.equal(splitActions([a('shop'), a('instacart')]).primary?.id, 'shop');
  const none = splitActions([a('instacart'), a('doordash')]);
  assert.equal(none.primary, undefined);
  assert.deepEqual(none.secondary.map((x) => x.id), ['instacart', 'doordash']);
  assert.deepEqual(splitActions([]), { primary: undefined, secondary: [] });
});

test('saved stores move up, each group keeps its order', () => {
  const { saved, rest } = partitionSaved([1, 2, 3, 4, 5], (n) => n % 2 === 0);
  assert.deepEqual(saved, [2, 4]);
  assert.deepEqual(rest, [1, 3, 5]);
});

test('resolveStoreActions: order, text-only labels, no claims', () => {
  const actions = resolveStoreActions({ name: 'Safeway', link: 'https://local.safeway.com/safeway/ca/x.html' });
  assert.deepEqual(actions.map((x) => x.id), ['flyer', 'shop', 'instacart', 'doordash']);
  assert.deepEqual(actions.slice(2).map((x) => x.label), ['Order with Instacart', 'Order with DoorDash']);
  for (const x of actions) assert.doesNotMatch(x.label, /partner|free|save \$/i);
  assert.deepEqual(resolveStoreActions({ name: 'Wild Prairie Farm' }), []);
});
