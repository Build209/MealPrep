/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DetectedItem } from '../src/scan/request';
import {
  displayName,
  editRow,
  includedCount,
  ingredientIdFor,
  isIncluded,
  pantryStatusFor,
  parseQuantity,
  planSave,
  removeRow,
  saveButtonLabel,
  savedMessage,
  setIncluded,
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
    kind: 'shelf',
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
  assert.deepEqual(plan.topUps, []);
  assert.deepEqual(plan.inserts, [
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
  assert.equal(saveButtonLabel(0), 'Nothing to save');
});

// ------------------------------------------------- matching against the pantry

const pantry = [
  { id: 'p-beans', ingredientId: 'black-beans', name: 'Black Beans', quantity: 2, unit: 'can' },
  { id: 'p-milk', ingredientId: 'milk', name: 'Milk', quantity: 1, unit: 'gallon' },
  { id: 'p-rice', ingredientId: 'rice', name: 'Rice', quantity: 3, unit: 'cup' },
];

test('shelf scan: items already in the pantry are shown as such and left out unless ticked', () => {
  const rows = toReviewRows(
    [
      { name: 'black beans', quantity: 1, unit: 'can', category: 'dry_goods', storage: 'pantry', confidence: 0.9 },
      { name: 'paprika', quantity: 1, unit: 'jar', category: 'spices', storage: 'spice_rack', confidence: 0.9 },
    ],
    'shelf',
    'pantry',
  );
  const status = pantryStatusFor(rows[0]!, pantry);
  assert.deepEqual(status, { kind: 'already', name: 'Black Beans', quantity: 2, unit: 'can' });
  assert.equal(isIncluded(rows[0]!, status), false, 'unticked by default');
  assert.deepEqual(pantryStatusFor(rows[1]!, pantry), { kind: 'new' });
  assert.equal(includedCount(rows, pantry), 1);

  const plan = planSave('user-1', rows, pantry);
  assert.ok(plan.ok);
  assert.deepEqual(plan.inserts.map((r) => r.name), ['Paprika'], 'no duplicate beans row');
  assert.deepEqual(plan.topUps, [], 'a shelf scan never changes quantities');

  // The person can still add it.
  const ticked = setIncluded(rows, 'scan-0', true);
  assert.equal(includedCount(ticked, pantry), 2);
  const planTicked = planSave('user-1', ticked, pantry);
  assert.ok(planTicked.ok);
  assert.deepEqual(planTicked.inserts.map((r) => r.name), ['Black Beans', 'Paprika']);

  // Unticking a new item leaves it out; problems on unticked rows do not block saving.
  const unticked = setIncluded(editRow(rows, 'scan-1', { quantityText: '0' }), 'scan-1', false);
  const none = planSave('user-1', unticked, pantry);
  assert.ok(none.ok);
  assert.deepEqual(none.inserts, []);
});

test('receipt scan: same item and unit adds to the existing row; another unit is its own row', () => {
  const rows = toReviewRows(
    [
      { name: 'black beans', quantity: 3, unit: 'can', category: 'dry_goods', storage: null, confidence: 0.9 },
      { name: 'Black Beans', quantity: 1, unit: 'CAN', category: 'dry_goods', storage: null, confidence: 0.9 },
      { name: 'rice', quantity: 2, unit: 'lb', category: 'dry_goods', storage: null, confidence: 0.9 },
      { name: 'bananas', quantity: 6, unit: 'each', category: 'produce', storage: null, confidence: 0.9 },
    ],
    'receipt',
    'pantry',
  );
  assert.deepEqual(pantryStatusFor(rows[0]!, pantry), { kind: 'top-up', name: 'Black Beans', quantity: 2, unit: 'can' });
  assert.equal(isIncluded(rows[0]!, pantryStatusFor(rows[0]!, pantry)), true, 'receipt lines stay ticked');
  assert.equal(pantryStatusFor(rows[2]!, pantry).kind, 'other-unit');
  assert.equal(pantryStatusFor(rows[3]!, pantry).kind, 'new');

  const plan = planSave('user-1', rows, pantry);
  assert.ok(plan.ok);
  assert.deepEqual(plan.topUps, [{ id: 'p-beans', name: 'Black Beans', unit: 'can', quantity: 6 }], '2 + 3 + 1, one update');
  assert.deepEqual(
    plan.inserts.map((r) => [r.name, r.quantity, r.unit]),
    [
      ['Rice', 2, 'lb'],
      ['Bananas', 6, 'each'],
    ],
  );
});

test('saved message', () => {
  assert.equal(savedMessage(2, 0), 'Saved 2 items to your pantry.');
  assert.equal(savedMessage(1, 0), 'Saved 1 item to your pantry.');
  assert.equal(savedMessage(0, 1), 'Added to 1 item you already had.');
  assert.equal(savedMessage(1, 2), 'Saved 1 item to your pantry and added to 2 items you already had.');
});
