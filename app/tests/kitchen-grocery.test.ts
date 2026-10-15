/// <reference types="node" />
// Cases from the old app's mobile/scripts/grocery-grouping-check.ts (aisle order, manual items),
// grocery-regression.ts (manual items, pantry match by name + unit, units never mix) and the
// aisle grouping in mobile/lib/grocery.ts. Day / meal grouping arrives with recipes (phase 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROCERY_AISLE_ORDER,
  groceryDedupeKey,
  groupGroceryByAisle,
  manualGroceryFields,
} from '../src/kitchen/groceryAisles';
import { findPantryRowForGrocery, pantryPlaceForGrocery, sameUnit } from '../src/kitchen/groceryRestock';
import { PANTRY_CATEGORIES } from '../src/kitchen/categories';

test('aisle order covers every category, produce first', () => {
  assert.equal(GROCERY_AISLE_ORDER[0], 'produce');
  assert.deepEqual([...GROCERY_AISLE_ORDER].sort(), [...PANTRY_CATEGORIES].sort());
});

test('grouped by aisle in store order, A to Z inside, empty aisles left out', () => {
  const items = [
    { id: '1', name: 'Rice', category: 'dry_goods' },
    { id: '2', name: 'spinach', category: 'produce' },
    { id: '3', name: 'Apples', category: 'produce' },
    { id: '4', name: 'Milk', category: 'dairy' },
    { id: '5', name: 'Mystery', category: 'Grains' }, // unknown stored category → dry goods
  ];
  const aisles = groupGroceryByAisle(items);
  assert.deepEqual(
    aisles.map((a) => [a.category, a.label, a.items.map((i) => i.name)]),
    [
      ['produce', 'Produce', ['Apples', 'spinach']],
      ['dairy', 'Dairy', ['Milk']],
      ['dry_goods', 'Dry goods', ['Mystery', 'Rice']],
    ],
  );
  assert.equal(items[0]!.name, 'Rice', 'input is not changed');
  assert.deepEqual(groupGroceryByAisle([]), []);
});

test('produce sorts before dry goods (grocery-grouping-check)', () => {
  const manual = manualGroceryFields({ name: 'Paper towels', quantity: 1, unit: 'each' });
  const order = groupGroceryByAisle([manual, { name: 'Onion', category: 'produce' }]).map((a) => a.category);
  assert.ok(order.indexOf('produce') < order.indexOf('dry_goods'));
});

test('a hand-added row: trimmed, aisle from the name, unit defaults to each, origin manual', () => {
  const row = manualGroceryFields({ name: '  Chicken thighs ', quantity: 2, unit: ' lb ' }, 1700000000000);
  assert.deepEqual(row, {
    ingredientId: 'manual-chicken-thighs-1700000000000',
    name: 'Chicken thighs',
    category: 'meats',
    quantity: 2,
    unit: 'lb',
    origin: 'manual',
  });
  assert.equal(manualGroceryFields({ name: 'limes', quantity: 1, unit: '' }).unit, 'each');
  assert.equal(manualGroceryFields({ name: 'rice', quantity: 1, unit: 'kg' }).category, 'dry_goods');
  assert.equal(manualGroceryFields({ name: 'spinach', quantity: 1, unit: 'bag' }).category, 'produce');
  assert.equal(manualGroceryFields({ name: 'x', quantity: 1, unit: 'each', category: 'frozen' }).category, 'frozen');
});

test('dedupe key: normalised name + unit, case and spaces ignored (manual limes merge with Limes)', () => {
  assert.equal(groceryDedupeKey('Limes', 'each'), groceryDedupeKey('limes', ' Each '));
  assert.notEqual(groceryDedupeKey('Garlic', 'head'), groceryDedupeKey('Garlic', 'clove'));
});

test('a ticked item adds to the pantry row with the same ingredient and unit', () => {
  const pantry = [
    { id: 'p1', name: 'Milk', unit: 'l', updatedAt: '2026-10-01T00:00:00Z' },
    { id: 'p2', name: 'Garlic', unit: 'head', updatedAt: '2026-10-01T00:00:00Z' },
    { id: 'temp-x', name: 'Bananas', unit: 'each' },
  ];
  assert.equal(findPantryRowForGrocery(pantry, { name: ' milk ', unit: 'L', category: 'dairy' })?.id, 'p1');
  assert.equal(findPantryRowForGrocery(pantry, { name: 'Milk', unit: 'ml', category: 'dairy' }), null, 'units never mix');
  assert.equal(findPantryRowForGrocery(pantry, { name: 'Garlic', unit: 'clove', category: 'produce' }), null, 'head is not clove');
  assert.equal(findPantryRowForGrocery(pantry, { name: 'Bananas', unit: 'each', category: 'produce' }), null, 'unsaved rows skipped');
  assert.equal(findPantryRowForGrocery(pantry, { name: '', unit: 'each', category: 'produce' }), null);
  assert.equal(findPantryRowForGrocery([], { name: 'Milk', unit: 'l', category: 'dairy' }), null);
});

test('several matches: the most recently updated row wins, then the lowest id', () => {
  const pantry = [
    { id: 'b', name: 'Eggs', unit: 'each', updatedAt: '2026-10-01T00:00:00Z' },
    { id: 'c', name: 'eggs', unit: 'each', updatedAt: '2026-10-05T00:00:00Z' },
    { id: 'a', name: 'Eggs', unit: 'each', updatedAt: '2026-10-05T00:00:00Z' },
  ];
  assert.equal(findPantryRowForGrocery(pantry, { name: 'Eggs', unit: 'each', category: 'dairy' })?.id, 'a');
});

test('a new pantry row from a tick goes where the add sheet would put it', () => {
  assert.equal(pantryPlaceForGrocery({ name: 'Milk', unit: 'l', category: 'dairy' }), 'fridge');
  assert.equal(pantryPlaceForGrocery({ name: 'Cumin', unit: 'jar', category: 'spices' }), 'spice_rack');
  assert.equal(pantryPlaceForGrocery({ name: 'Rice', unit: 'kg', category: 'dry_goods' }), 'pantry');
  assert.ok(sameUnit(' Cup', 'cup '));
});
