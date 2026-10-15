/// <reference types="node" />
// Cases from the old app's mobile/scripts/pantry-scan-review-dedupe-check.ts,
// pantry-receipt-scan-check.ts and pantry-scan-restock-regression.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bestPantryMatch,
  findAlreadyInPantry,
  formatDetectedIngredientName,
  matchReceiptLine,
  pantryItemsMatch,
  sameUnit,
  slugIngredientId,
} from '../src/kitchen/pantryMatch';

const row = (name: string, quantity: number, unit: string, ingredientId = name.toLowerCase().replace(/\s+/g, '-')) => ({
  id: `p-${ingredientId}`,
  ingredientId,
  name,
  quantity,
  unit,
});

test('shelf scan: an item already in the pantry is found (old dedupe check)', () => {
  const pantry = [row('Eggs', 6, 'each', 'egg')];
  assert.equal(findAlreadyInPantry('eggs', pantry)?.id, 'p-egg', 'eggs already in the pantry');
  assert.equal(findAlreadyInPantry('milk', pantry), null, 'milk is new');
  assert.equal(findAlreadyInPantry('eggs', []), null, 'empty pantry: everything is new');
  assert.equal(findAlreadyInPantry('  ', pantry), null);
});

test('shelf scan: owned black beans are found, milk and bananas are not (old receipt check)', () => {
  const pantry = [row('black beans', 1, 'can'), row('rice', 1, 'bag')];
  assert.equal(findAlreadyInPantry('black beans', pantry)?.id, 'p-black-beans');
  assert.equal(findAlreadyInPantry('Black Beans', pantry)?.id, 'p-black-beans', 'any case');
  assert.equal(findAlreadyInPantry('whole milk', pantry), null);
  assert.equal(findAlreadyInPantry('bananas', pantry), null);
});

test('matching by ingredient id or by the same ingredient name', () => {
  // Same ingredient id, different spelling of the name.
  const pantry = [row('Garbanzo', 1, 'can', 'black-beans')];
  assert.equal(findAlreadyInPantry('black beans', pantry)?.id, 'p-black-beans');
  assert.equal(bestPantryMatch('cheddar cheese', [row('Rice', 1, 'cup')]), null, 'unrelated names never match');
});

test('names and slugs as the old app made them', () => {
  assert.equal(formatDetectedIngredientName('  black beans '), 'Black Beans');
  assert.equal(formatDetectedIngredientName(''), '');
  assert.equal(slugIngredientId('Black Beans'), 'black-beans');
  assert.ok(sameUnit(' Can', 'can'));
  assert.ok(!sameUnit('can', 'cup'));
});

test('restock identity: specific satisfies generic, not the reverse (old restock regression)', () => {
  const existing = row('chicken breast', 1, 'lb');
  assert.ok(pantryItemsMatch(existing, { ingredientId: 'x', name: 'boneless chicken breast 2 lb' }));
  assert.ok(!pantryItemsMatch(row('ground beef', 1, 'lb'), { ingredientId: 'beef', name: 'beef' }));
  assert.ok(pantryItemsMatch(row('Milk', 1, 'gallon', 'milk'), { ingredientId: 'milk', name: 'Something else' }), 'same id');
});

test('receipt lines: top up the same unit, keep another unit apart, add the rest', () => {
  const pantry = [row('black beans', 1, 'can'), row('rice', 1, 'bag')];
  const beans = matchReceiptLine({ name: 'Black Beans', ingredientId: 'black-beans', unit: 'Can' }, pantry);
  assert.equal(beans.kind, 'top-up');
  assert.equal(beans.kind === 'top-up' ? beans.row.id : null, 'p-black-beans');

  const rice = matchReceiptLine({ name: 'Rice', ingredientId: 'rice', unit: 'lb' }, pantry);
  assert.equal(rice.kind, 'other-unit');

  const milk = matchReceiptLine({ name: 'Whole Milk', ingredientId: 'whole-milk', unit: 'gallon' }, pantry);
  assert.equal(milk.kind, 'new');

  // Two rows for the same thing: the one in the same unit wins.
  const twoRice = [row('rice', 1, 'bag'), { ...row('rice', 2, 'lb'), id: 'p-rice-lb' }];
  const riceLb = matchReceiptLine({ name: 'Rice', ingredientId: 'rice', unit: 'lb' }, twoRice);
  assert.equal(riceLb.kind === 'top-up' ? riceLb.row.id : null, 'p-rice-lb');
});
