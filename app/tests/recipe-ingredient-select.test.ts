/// <reference types="node" />
// Recipe detail checkboxes: which rows can be ticked, selection state, what each batch saves, result lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRecipeWithCart, type CartRow } from '../src/kitchen/recipeCart';
import {
  allSelected,
  cartBatch,
  cartBatchMessage,
  pantryBatch,
  pantryBatchMessage,
  pruneSelection,
  selectableIndexes,
  tickedIndexes,
  toggleSelectAll,
  toggleSelection,
  withoutIndexes,
} from '../src/recipes/ingredientSelect';

const slug = (n: string) => n.toLowerCase().replace(/\s+/g, '-');
const row = (name: string, quantity = 1, unit = 'each', extra: Partial<CartRow> = {}) => ({
  id: `r-${slug(name)}`,
  ingredientId: slug(name),
  name,
  quantity,
  unit,
  category: 'produce',
  ...extra,
});
const ing = (name: string, quantity: number, unit: string) => ({ ingredientId: slug(name), name, quantity, unit });

// lettuce: in pantry; cilantro: in cart; radish: missing; olive oil: staple; water: staple (never); beef: short in pantry
const recipe = {
  id: 'r_1',
  name: 'Test',
  ingredients: [
    ing('Lettuce', 1, 'head'),
    ing('Cilantro', 1, 'bunch'),
    ing('Radish', 4, 'each'),
    ing('Olive oil', 2, 'tbsp'),
    ing('Water', 1, 'cup'),
  ],
};
const pantry = [row('Lettuce', 2, 'head')];
const cart = [row('Cilantro', 1, 'bunch')];
const match = () => scoreRecipeWithCart(recipe, pantry, cart);

test('selectable rows: missing, in cart, and staples without a pantry row; never In pantry or water', () => {
  const m = match();
  assert.deepEqual(selectableIndexes(m.lines, m.pantry.lines, pantry), [1, 2, 3]);
});

test('a staple the pantry holds is not selectable', () => {
  const held = [...pantry, row('Olive oil', 1, 'bottle')];
  const m = scoreRecipeWithCart(recipe, held, cart);
  assert.deepEqual(selectableIndexes(m.lines, m.pantry.lines, held), [1, 2]);
});

test('toggle, select all, clear, prune', () => {
  const selectable = [1, 2, 3];
  let sel = toggleSelection(new Set(), 2);
  assert.deepEqual(tickedIndexes(sel), [2]);
  assert.equal(allSelected(sel, selectable), false);
  sel = toggleSelectAll(sel, selectable);
  assert.deepEqual(tickedIndexes(sel), [1, 2, 3]);
  assert.equal(allSelected(sel, selectable), true);
  assert.equal(toggleSelectAll(sel, selectable).size, 0); // all ticked -> clears
  assert.equal(toggleSelection(sel, 2).has(2), false);
  assert.deepEqual(tickedIndexes(pruneSelection(sel, [1, 3])), [1, 3]); // row 2 turned In pantry
  assert.equal(pruneSelection(sel, selectable), sel); // unchanged keeps identity
  assert.deepEqual(tickedIndexes(withoutIndexes(sel, [1, 3])), [2]);
  assert.equal(allSelected(new Set(), []), false);
});

test('pantry batch: one pantry add per ticked row, recipe amount and unit', () => {
  const m = match();
  const items = pantryBatch([1, 2, 3], m.lines, pantry);
  assert.deepEqual(
    items.map((i) => [i.index, i.name, i.add.ingredientId, i.add.fields.quantity, i.add.fields.unit]),
    [
      [1, 'Cilantro', 'cilantro', 1, 'bunch'],
      [2, 'Radish', 'radish', 4, 'each'],
      [3, 'Olive oil', 'olive-oil', 2, 'tbsp'],
    ],
  );
  assert.deepEqual(pantryBatch([99], m.lines, pantry), []);
});

test('cart batch: skips rows already In cart, sends what is still needed, counts the skipped', () => {
  const m = match();
  const all = cartBatch([1, 2, 3], m.lines, pantry);
  assert.equal(all.alreadyInCart, 1);
  assert.deepEqual(
    all.lines.map((l) => [l.name, l.quantity, l.unit]),
    [
      ['Radish', 4, 'each'],
      ['Olive oil', 2, 'tbsp'],
    ],
  );
  const onlyCart = cartBatch([1], m.lines, pantry);
  assert.deepEqual(onlyCart, { lines: [], alreadyInCart: 1 });
});

test('cart batch asks for the remainder on a partly covered row', () => {
  const r = { id: 'r_2', name: 'T', ingredients: [ing('Lime', 3, 'each')] };
  const m = scoreRecipeWithCart(r, [], [row('Lime', 1, 'each')]);
  assert.equal(m.lines[0]!.status, 'missing');
  const out = cartBatch([0], m.lines, []);
  assert.deepEqual(out.lines.map((l) => [l.name, l.quantity]), [['Lime', 2]]);
});

test('pantry result messages: all added, partial (names, still ticked), none', () => {
  assert.equal(pantryBatchMessage(1, []), 'Added 1 item to your pantry.');
  assert.equal(pantryBatchMessage(3, []), 'Added 3 items to your pantry.');
  assert.equal(
    pantryBatchMessage(2, [{ name: 'Kale', message: 'Network down.' }]),
    'Added 2 items to your pantry. Not added: Kale. Still ticked. Network down.',
  );
  assert.equal(
    pantryBatchMessage(0, [
      { name: 'Kale', message: 'Nope.' },
      { name: 'Lime', message: 'Nope.' },
    ]),
    'Nothing was added to your pantry. Not added: Kale, Lime. Still ticked. Nope.',
  );
});

test('cart result messages reuse the grocery wording and count rows already In cart', () => {
  assert.equal(cartBatchMessage({ added: 3, merged: 0, unchanged: 0 }, 0), 'Added 3 items to your grocery list.');
  assert.equal(
    cartBatchMessage({ added: 2, merged: 0, unchanged: 0 }, 1),
    'Added 2 items to your grocery list. 1 was already in your cart.',
  );
  assert.equal(cartBatchMessage(null, 2), 'Already in your cart. Nothing added.');
});
