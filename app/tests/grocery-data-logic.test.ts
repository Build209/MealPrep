/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataError } from '../src/data/errors';
import {
  groceryInsertColumns,
  groceryItemFromRow,
  groceryItemToRow,
  groceryRestoreColumns,
  groceryRpcError,
  normalizeGroceryOrigin,
  placeholderGroceryItem,
  removeChecked,
  restoreMany,
  tickResultFromJson,
  untickResultFromJson,
  upsertPantryRow,
  validateGroceryFields,
  type GroceryItem,
  type GroceryItemRow,
} from '../src/data/groceryRows';
import { rollback } from '../src/data/listOps';
import type { PantryItem, PantryItemRow } from '../src/data/rows';
import { ADD_FORM_COPY, emptyGroceryForm, groceryRowLabel, groceryView, readGroceryForm } from '../src/grocery/groceryLogic';

const ROW: GroceryItemRow = {
  id: 'g1',
  user_id: 'u1',
  ingredient_id: 'manual-milk-1',
  name: 'Milk',
  category: 'dairy',
  quantity: '2', // numeric may arrive as a string
  unit: 'l',
  checked: false,
  source_recipe_ids: ['r1', 7],
  updated_at: '2026-10-13T10:00:00Z',
  origin: 'manual',
  planned_meal_links: [{ mealPlanItemId: 'm1', scheduledOn: '2026-10-14', mealSlot: 'dinner', mealTitle: 'Chili' }, { bad: 1 }],
};

const PANTRY_ROW: PantryItemRow = {
  id: 'p1',
  user_id: 'u1',
  ingredient_id: 'milk',
  name: 'Milk',
  category: 'dairy',
  quantity: 3,
  unit: 'l',
  location: 'fridge',
  photo_url: null,
  expires_on: null,
  updated_at: '2026-10-13T10:00:00Z',
  scan_photo_path: null,
};

function item(id: string, name: string, extra: Partial<GroceryItem> = {}): GroceryItem {
  return { ...groceryItemFromRow({ ...ROW, id, name }), ...extra };
}

test('rows map both ways; numbers, origins and links are read safely', () => {
  const g = groceryItemFromRow(ROW);
  assert.equal(g.quantity, 2);
  assert.deepEqual(g.sourceRecipeIds, ['r1']);
  assert.deepEqual(g.plannedMealLinks, [{ mealPlanItemId: 'm1', scheduledOn: '2026-10-14', mealSlot: 'dinner', mealTitle: 'Chili' }]);
  const back = groceryItemToRow(g);
  assert.equal(back.id, 'g1');
  assert.equal(back.user_id, 'u1');
  assert.equal(back.quantity, 2);
  assert.equal(groceryItemFromRow({ ...ROW, source_recipe_ids: null, planned_meal_links: 'x' }).plannedMealLinks.length, 0);
  assert.equal(normalizeGroceryOrigin('weird', 'manual-x'), 'manual');
  assert.equal(normalizeGroceryOrigin(null, 'onion'), 'plan');
  assert.equal(normalizeGroceryOrigin('add_missing', 'onion'), 'add_missing');
});

test('add: checks, insert body, placeholder', () => {
  assert.throws(() => validateGroceryFields({ name: '  ' }), (e) => e instanceof DataError && e.kind === 'invalid');
  assert.throws(() => validateGroceryFields({ quantity: 0 }), DataError);
  assert.throws(() => validateGroceryFields({ quantity: Number.NaN }), DataError);
  validateGroceryFields({ name: 'Milk', quantity: 0.5 });

  const vars = { ingredientId: 'manual-milk-1', name: ' Milk ', category: 'dairy', quantity: 2, unit: ' ', origin: 'manual' as const, tempId: 'temp-1' };
  assert.deepEqual(groceryInsertColumns('u1', vars), {
    user_id: 'u1',
    ingredient_id: 'manual-milk-1',
    name: 'Milk',
    category: 'dairy',
    quantity: 2,
    unit: 'each',
    checked: false,
    origin: 'manual',
  });
  const p = placeholderGroceryItem('u1', vars, new Date('2026-10-13T00:00:00Z'));
  assert.equal(p.id, 'temp-1');
  assert.equal(p.unit, 'each');
  assert.equal(p.checked, false);

  const restore = groceryRestoreColumns('u1', groceryItemFromRow(ROW));
  assert.equal(restore.id, 'g1');
  assert.equal(restore.user_id, 'u1');
});

test('tick and untick answers from the server', () => {
  const t = tickResultFromJson({ grocery: { ...ROW, checked: true }, pantry: PANTRY_ROW, created: false, changed: true });
  assert.equal(t.grocery.checked, true);
  assert.equal(t.pantry?.id, 'p1');
  assert.equal(t.created, false);
  assert.equal(t.changed, true);
  const repeat = tickResultFromJson({ grocery: { ...ROW, checked: true }, pantry: null, created: false, changed: false });
  assert.equal(repeat.pantry, null);
  assert.equal(repeat.changed, false);
  const u = untickResultFromJson({ grocery: ROW, pantry: PANTRY_ROW, deleted: true, changed: true });
  assert.equal(u.deleted, true);
  assert.throws(() => tickResultFromJson(null), DataError);
});

test('rpc errors read plainly', () => {
  assert.equal(groceryRpcError({ code: 'P0002', message: 'Grocery item not found.' }).kind, 'not-found');
  assert.equal(groceryRpcError({ code: '42501' }).kind, 'forbidden');
  assert.match(groceryRpcError({ code: 'PGRST202' }).message, /isn't available/);
  assert.equal(groceryRpcError(new TypeError('Failed to fetch')).kind, 'network');
});

test('pantry list on screen takes the server row (replace or add)', () => {
  const pantry = [{ id: 'p0' }, { id: 'p1', quantity: 1 }] as unknown as PantryItem[];
  const row = { id: 'p1', quantity: 3 } as unknown as PantryItem;
  assert.deepEqual(upsertPantryRow(pantry, row).map((p) => p.id), ['p0', 'p1']);
  assert.equal(upsertPantryRow(pantry, row)[1]!.quantity, 3);
  assert.deepEqual(upsertPantryRow(pantry, { id: 'p2' } as PantryItem).map((p) => p.id), ['p0', 'p1', 'p2']);
});

test('clear ticked and its undo, with targeted rollback', () => {
  const list = [item('a', 'Apples', { checked: true }), item('b', 'Bread'), item('c', 'Cheese', { checked: true })];
  const change = removeChecked<GroceryItem>();
  const applied = change.apply(list);
  assert.deepEqual(applied.map((i) => i.id), ['b']);
  // Nothing else changed: the snapshot comes back exactly.
  assert.deepEqual(rollback(applied, list, applied, change).map((i) => i.id), ['a', 'b', 'c']);
  // A new row arrived meanwhile: only the cleared rows come back, the new one stays.
  const moved = [...applied, item('d', 'Dates')];
  assert.deepEqual(rollback(moved, list, applied, change).map((i) => i.id).sort(), ['a', 'b', 'c', 'd']);

  const cleared = [list[0]!, list[2]!];
  const back = restoreMany<GroceryItem>(cleared);
  assert.deepEqual(back.apply(applied).map((i) => i.id), ['b', 'a', 'c']);
  assert.deepEqual(back.apply(list).map((i) => i.id), ['a', 'b', 'c'], 'already there: no duplicates');
  assert.deepEqual(back.revert(back.apply(applied), applied).map((i) => i.id), ['b']);
});

test('add form: reads quantity, refuses empty name and zero', () => {
  assert.deepEqual(emptyGroceryForm(), { name: '', quantity: '1', unit: 'each' });
  const ok = readGroceryForm({ name: ' Milk ', quantity: '1 1/2', unit: 'l' }, 5);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.fields, { ingredientId: 'manual-milk-5', name: 'Milk', category: 'dairy', quantity: 1.5, unit: 'l', origin: 'manual' });
  }
  const bad = readGroceryForm({ name: '', quantity: '0', unit: '' });
  assert.ok(!bad.ok);
  if (!bad.ok) {
    assert.equal(bad.errors.name, ADD_FORM_COPY.errors.name);
    assert.equal(bad.errors.quantity, ADD_FORM_COPY.errors.quantity);
  }
  assert.ok(!readGroceryForm({ name: 'x', quantity: 'abc', unit: '' }).ok);
});

test('screen view: open rows by aisle, ticked rows apart, labels', () => {
  const list = [
    item('a', 'Rice', { category: 'dry_goods' }),
    item('b', 'Spinach', { category: 'produce' }),
    item('c', 'Milk', { category: 'dairy', checked: true }),
    item('d', 'Butter', { category: 'dairy', checked: true }),
  ];
  const view = groceryView(list);
  assert.equal(view.openCount, 2);
  assert.deepEqual(view.aisles.map((a) => a.category), ['produce', 'dry_goods']);
  assert.deepEqual(view.ticked.map((i) => i.name), ['Butter', 'Milk']);
  assert.equal(groceryRowLabel({ name: 'Milk', quantity: 2, unit: 'l' }), 'Milk, 2 l');
});
