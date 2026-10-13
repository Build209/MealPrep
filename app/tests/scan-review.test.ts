/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DetectedItem } from '../src/scan/request';
import {
  displayName,
  editRow,
  ingredientIdFor,
  parseQuantity,
  planSave,
  removeRow,
  saveButtonLabel,
  toReviewRows,
} from '../src/scan/review';

const items: DetectedItem[] = [
  { name: 'black beans', quantity: 2, unit: 'can', category: 'dry_goods', storage: 'pantry', confidence: 0.9 },
  { name: 'whole milk', quantity: 1, unit: 'gallon', category: 'dairy', storage: null, confidence: 0.5 },
  { name: 'blur', quantity: 1, unit: 'each', category: 'dry_goods', storage: null, confidence: 0.1 },
];

test('detected items become review rows; junk dropped; low confidence marked', () => {
  const rows = toReviewRows(items, 'shelf', 'fridge');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    key: 'scan-0',
    name: 'Black Beans',
    quantityText: '2',
    unit: 'can',
    place: 'pantry',
    category: 'dry_goods',
    confidence: 0.9,
    needsCheck: false,
  });
  assert.equal(rows[1]!.place, 'fridge', 'no storage from the function: where the photo was taken');
  assert.equal(rows[1]!.needsCheck, true);
  assert.equal(toReviewRows(items, 'receipt', 'fridge')[1]!.place, 'pantry', 'a receipt has no place of its own');
});

test('rows can be edited and removed', () => {
  let rows = toReviewRows(items, 'shelf', 'pantry');
  rows = editRow(rows, 'scan-1', { name: 'Oat milk', quantityText: '2.5', unit: 'carton', place: 'fridge' });
  assert.deepEqual(
    { name: rows[1]!.name, q: rows[1]!.quantityText, unit: rows[1]!.unit, place: rows[1]!.place, check: rows[1]!.needsCheck },
    { name: 'Oat milk', q: '2.5', unit: 'carton', place: 'fridge', check: false },
  );
  rows = removeRow(rows, 'scan-0');
  assert.deepEqual(rows.map((r) => r.key), ['scan-1']);
});

test('quantities people type', () => {
  assert.equal(parseQuantity('2'), 2);
  assert.equal(parseQuantity(' 1.5 '), 1.5);
  assert.equal(parseQuantity('2,5'), 2.5);
  assert.equal(parseQuantity('.5'), 0.5);
  assert.equal(parseQuantity('3.'), 3);
  for (const bad of ['', '0', '-1', 'abc', '1e3', '10000', '1.2.3']) assert.equal(parseQuantity(bad), null, bad);
});

test('save plan: insert rows for the signed-in user, or problems by row', () => {
  const rows = editRow(toReviewRows(items, 'shelf', 'pantry'), 'scan-1', { name: 'oat milk ', quantityText: '2' });
  const plan = planSave('user-1', rows);
  assert.ok(plan.ok);
  assert.deepEqual(plan.rows, [
    { user_id: 'user-1', ingredient_id: 'black-beans', name: 'Black Beans', category: 'dry_goods', quantity: 2, unit: 'can', location: 'pantry' },
    { user_id: 'user-1', ingredient_id: 'oat-milk', name: 'Oat Milk', category: 'dairy', quantity: 2, unit: 'gallon', location: 'pantry' },
  ]);

  const bad = planSave('user-1', editRow(editRow(rows, 'scan-0', { name: '  ' }), 'scan-1', { quantityText: '0' }));
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.match(bad.problems['scan-0'] ?? '', /name/);
    assert.match(bad.problems['scan-1'] ?? '', /Quantity/);
  }
});

test('names and ingredient ids', () => {
  assert.equal(displayName('  bbq   sauce '), 'Bbq Sauce');
  assert.equal(displayName('BBQ sauce'), 'BBQ Sauce');
  assert.equal(ingredientIdFor("Trader Joe's Salsa!"), 'trader-joe-s-salsa');
  assert.equal(ingredientIdFor('!!!'), 'ingredient');
  assert.equal(saveButtonLabel(1), 'Save 1 item to pantry');
  assert.equal(saveButtonLabel(3), 'Save 3 items to pantry');
});
