/// <reference types="node" />
// Scan filing mistakes from the phone test (2026-10-14): "Leftover stew filed as cookware, juice
// as dry goods, near-duplicate pickles."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferGroceryCategoryFromName, isCookwareName } from '../src/kitchen/categorize';
import { findAlreadyInPantry, type PantryMatchRow } from '../src/kitchen/pantryMatch';
import { fileScannedItem, isDrinkName, isJuiceName, isPreparedDishName } from '../src/kitchen/scanFiling';
import { buildPantryShelves } from '../src/pantry/shelves/shelfView';
import type { ShelvedItem } from '../src/pantry/types';
import type { DetectedItem } from '../src/scan/request';
import { pantryStatusFor, planSave, toReviewRows } from '../src/scan/review';

const detected = (name: string, category: DetectedItem['category'], storage: DetectedItem['storage'], unit = 'each', quantity = 1): DetectedItem => ({
  name,
  quantity,
  unit,
  category,
  storage,
  confidence: 0.9,
});

test('leftover stew, chili and soup go to the fridge as food, never cookware', () => {
  for (const name of ['leftover stew', 'beef stew', 'chili', 'leftover chili', 'chicken soup', 'leftovers', 'pot roast', 'lasagna']) {
    const filed = fileScannedItem({ name, unit: 'container', category: 'cookware', storage: 'pantry' }, 'fridge', 'fridge');
    assert.equal(filed.storage, 'fridge', `${name}: fridge`);
    assert.notEqual(filed.category, 'cookware', `${name}: not cookware`);
    assert.notEqual(filed.category, 'dry_goods', `${name}: not dry goods`);
  }
  assert.deepEqual(fileScannedItem({ name: 'leftover stew', unit: 'each', category: 'cookware', storage: 'fridge' }, 'fridge', 'fridge'), {
    category: 'meats',
    storage: 'fridge',
  });
  assert.deepEqual(fileScannedItem({ name: 'vegetable soup', unit: 'bowl', category: 'dry_goods', storage: 'fridge' }, 'fridge', 'fridge'), {
    category: 'produce',
    storage: 'fridge',
  });
  // Leftovers found while scanning the pantry shelf still belong in the fridge.
  assert.equal(fileScannedItem({ name: 'leftover chili', unit: 'each', category: 'dry_goods', storage: 'pantry' }, 'pantry', 'pantry').storage, 'fridge');
});

test('canned and dry products named after a dish stay in the pantry', () => {
  assert.deepEqual(fileScannedItem({ name: 'tomato soup', unit: 'can', category: 'dry_goods', storage: 'pantry' }, 'pantry', 'pantry'), {
    category: 'dry_goods',
    storage: 'pantry',
  });
  assert.deepEqual(fileScannedItem({ name: 'beef stew', unit: 'can', category: 'cookware', storage: 'pantry' }, 'pantry', 'pantry'), {
    category: 'dry_goods',
    storage: 'pantry',
  });
  for (const name of ['chili powder', 'chili flakes', 'soup mix', 'curry paste', 'ramen']) {
    assert.equal(isPreparedDishName(name), false, name);
  }
  assert.equal(fileScannedItem({ name: 'chili powder', unit: 'jar', category: 'spices', storage: 'spice_rack' }, 'fridge', 'fridge').category, 'spices');
});

test('juice is never dry goods; orange juice and juice in the fridge go to the fridge', () => {
  assert.deepEqual(fileScannedItem({ name: 'orange juice', unit: 'carton', category: 'dry_goods', storage: 'pantry' }, 'pantry', 'pantry'), {
    category: 'produce',
    storage: 'fridge',
  });
  assert.deepEqual(fileScannedItem({ name: 'apple juice', unit: 'bottle', category: 'dry_goods', storage: 'fridge' }, 'fridge', 'fridge'), {
    category: 'produce',
    storage: 'fridge',
  });
  // An unopened bottle of apple juice on the pantry shelf can stay there; it is still not dry goods.
  assert.deepEqual(fileScannedItem({ name: 'apple juice', unit: 'bottle', category: 'dry_goods', storage: 'pantry' }, 'pantry', 'pantry'), {
    category: 'produce',
    storage: 'pantry',
  });
  assert.equal(fileScannedItem({ name: 'orange juice', unit: 'gallon', category: 'cookware', storage: null }, 'pantry', null).storage, 'fridge', 'receipt');
  assert.equal(isJuiceName('lemon juice'), false, 'bottled lemon juice is a condiment');
  assert.equal(isJuiceName('apple cider vinegar'), false);
  assert.equal(fileScannedItem({ name: 'lemon juice', unit: 'bottle', category: 'condiments', storage: 'fridge' }, 'fridge', 'fridge').category, 'condiments');
  assert.equal(isDrinkName('kombucha'), true);
  assert.equal(isDrinkName('pop tarts'), false);
});

test('real cookware is still cookware; dishes named after a pan are not', () => {
  for (const name of ['stock pot', 'cast iron skillet', 'Dutch oven', '9x13 baking dish', 'sheet pan', 'sauce pan', 'muffin tin']) {
    assert.equal(isCookwareName(name), true, name);
    assert.equal(inferGroceryCategoryFromName(name), 'cookware', name);
    assert.equal(fileScannedItem({ name, unit: 'each', category: 'cookware', storage: 'pantry' }, 'pantry', 'pantry').category, 'cookware', name);
  }
  for (const name of ['pot roast', 'pot pie', 'pancake mix', 'pan dulce', 'sheet cake', 'casserole', 'pizza', 'stew', 'tin of tuna', 'rice']) {
    assert.equal(isCookwareName(name), false, name);
  }
  // Food the model calls cookware is re-guessed from its name.
  assert.equal(fileScannedItem({ name: 'black beans', unit: 'can', category: 'cookware', storage: 'pantry' }, 'pantry', 'pantry').category, 'dry_goods');
  assert.equal(fileScannedItem({ name: 'cheddar cheese', unit: 'block', category: 'cookware', storage: 'fridge' }, 'fridge', 'fridge').category, 'dairy');
});

test('things the model already got right are left alone', () => {
  const cases: Array<[string, DetectedItem['category'], DetectedItem['storage']]> = [
    ['whole milk', 'dairy', 'fridge'],
    ['black beans', 'dry_goods', 'pantry'],
    ['paprika', 'spices', 'spice_rack'],
    ['ketchup', 'condiments', 'fridge'],
    ['frozen peas', 'frozen', 'fridge'],
  ];
  for (const [name, category, storage] of cases) {
    assert.deepEqual(fileScannedItem({ name, unit: 'each', category, storage }, 'pantry', 'pantry'), { category, storage }, name);
  }
});

test('the review list files the phone-test items correctly', () => {
  const rows = toReviewRows(
    [
      detected('leftover stew', 'cookware', 'pantry', 'container'),
      detected('orange juice', 'dry_goods', 'pantry', 'carton'),
      detected('cheddar cheese', 'dairy', 'fridge', 'block'),
    ],
    'shelf',
    'fridge',
  );
  assert.deepEqual(
    rows.map((r) => [r.name, r.category, r.place]),
    [
      ['Leftover Stew', 'meats', 'fridge'],
      ['Orange Juice', 'produce', 'fridge'],
      ['Cheddar Cheese', 'dairy', 'fridge'],
    ],
  );
  const plan = planSave('user-1', rows);
  assert.ok(plan.ok);
  assert.deepEqual(plan.inserts.map((r) => [r.category, r.location]), [
    ['meats', 'fridge'],
    ['produce', 'fridge'],
    ['dairy', 'fridge'],
  ]);
});

test('pickle near-duplicates in one shelf scan become one row', () => {
  const rows = toReviewRows(
    [
      detected('pickles', 'condiments', 'fridge', 'jar'),
      detected('dill pickles', 'condiments', 'fridge', 'jar'),
      detected('Vlasic Pickle Spears', 'condiments', 'fridge', 'jar'),
      detected('pickled onions', 'condiments', 'fridge', 'jar'),
    ],
    'shelf',
    'fridge',
  );
  assert.deepEqual(
    rows.map((r) => [r.name, r.quantityText, r.unit]),
    [
      ['Pickles', '3', 'jar'],
      ['Pickled Onions', '1', 'jar'],
    ],
  );
  // Same pickles in another unit: both kept, both flagged for the person to decide.
  const mixed = toReviewRows([detected('pickles', 'condiments', 'fridge', 'jar'), detected('pickle spears', 'condiments', 'fridge', 'bag')], 'shelf', 'fridge');
  assert.equal(mixed.length, 2);
  assert.ok(mixed.every((r) => r.needsCheck));
  // Receipt lines are not merged here (planSave adds them to the pantry row).
  assert.equal(toReviewRows([detected('pickles', 'condiments', null, 'jar'), detected('dill pickles', 'condiments', null, 'jar')], 'receipt', 'pantry').length, 2);
});

test('pickle near-duplicates match the pantry row already there', () => {
  const pantry: PantryMatchRow[] = [{ id: 'p-pickles', ingredientId: 'pickles', name: 'Pickles', quantity: 1, unit: 'jar' }];
  for (const name of ['Dill Pickles', 'Pickle Spears', 'pickle', 'Vlasic Dill Pickle Spears', 'Kosher Dill Pickles', 'Claussen Pickles']) {
    assert.equal(findAlreadyInPantry(name, pantry)?.id, 'p-pickles', name);
  }
  for (const name of ['Pickled Onions', 'Pickled Jalapenos', 'Relish']) {
    assert.equal(findAlreadyInPantry(name, pantry), null, name);
  }
  const [row] = toReviewRows([detected('dill pickle spears', 'condiments', 'fridge', 'jar')], 'shelf', 'fridge');
  assert.deepEqual(pantryStatusFor(row!, pantry), { kind: 'already', name: 'Pickles', quantity: 1, unit: 'jar' });
  const plan = planSave('user-1', [row!], pantry);
  assert.ok(plan.ok);
  assert.equal(plan.inserts.length, 0, 'not saved twice unless the person ticks it');
});

test('fridge shelves: leftovers and drinks get their own shelves', () => {
  const item = (id: string, name: string, category: ShelvedItem['category'], unit = 'each'): ShelvedItem =>
    ({ id, name, category, location: 'fridge', unit, quantity: 1, expiresOn: null }) as unknown as ShelvedItem;
  const shelves = buildPantryShelves(
    [item('1', 'Leftover Stew', 'meats'), item('2', 'Orange Juice', 'produce'), item('3', 'Strawberries', 'produce'), item('4', 'Chicken Breast', 'meats', 'lb')],
    'fridge',
  );
  assert.deepEqual(
    shelves.map((s) => [s.name, s.tiles.map((t) => t.item.name)]),
    [
      ['Produce', ['Strawberries']],
      ['Meats', ['Chicken Breast']],
      ['Leftovers', ['Leftover Stew']],
      ['Drinks', ['Orange Juice']],
    ],
  );
});
