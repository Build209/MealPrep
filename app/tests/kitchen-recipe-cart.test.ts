/// <reference types="node" />
// Recipe against pantry AND grocery list ("cart"): In pantry / In cart / still needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRecipeWithCart, type CartRow } from '../src/kitchen/recipeCart';
import { groceryLinesForMissing, readyToCookCount, recipeStatus } from '../src/kitchen/recipeFeed';
import { addMissingMessage, DETAIL_COPY, ingredientRowText } from '../src/recipes/recipeLogic';

const slug = (n: string) => n.toLowerCase().replace(/\s+/g, '-');
const row = (name: string, quantity = 1, unit = 'each', extra: Partial<CartRow> = {}) => ({
  id: `r-${slug(name)}-${unit}-${quantity}`,
  ingredientId: slug(name),
  name,
  quantity,
  unit,
  category: 'produce',
  ...extra,
});
const ing = (name: string, quantity: number, unit: string, ingredientId = slug(name)) => ({ ingredientId, name, quantity, unit });
const recipe = (...ingredients: ReturnType<typeof ing>[]) => ({ id: 'r_1', name: 'Test', ingredients });
const statuses = (m: ReturnType<typeof scoreRecipeWithCart>) => m.lines.map((l) => l.status);

test('pantry only: In pantry, nothing in cart, 0 needed', () => {
  const m = scoreRecipeWithCart(recipe(ing('Onion', 1, 'each')), [row('Onion', 2)], []);
  assert.deepEqual(statuses(m), ['have']);
  assert.equal(m.neededCount, 0);
  assert.equal(m.inPantryCount, 1);
  assert.equal(ingredientRowText(m.lines[0]!).status, 'In pantry');
});

test('cart only: In cart, 0 needed; the pantry-only result is untouched', () => {
  const r = recipe(ing('Onion', 1, 'each'));
  const m = scoreRecipeWithCart(r, [], [row('Onion', 1)]);
  assert.deepEqual(statuses(m), ['cart']);
  assert.equal(m.neededCount, 0);
  assert.equal(m.inCartCount, 1);
  assert.equal(ingredientRowText(m.lines[0]!).status, 'In cart');
  assert.equal(m.pantry.missingCount, 1, 'pantry-only view still says missing');
  assert.deepEqual(recipeStatus(m.pantry), { kind: 'missing', count: 1 });
});

test('nothing anywhere: counted as needed', () => {
  const m = scoreRecipeWithCart(recipe(ing('Onion', 1, 'each'), ing('Lime', 2, 'each')), [], [row('Onion', 1)]);
  assert.deepEqual(statuses(m), ['cart', 'missing']);
  assert.equal(m.neededCount, 1);
  assert.equal(DETAIL_COPY.itemsNeeded(m.neededCount), '1 item needed');
  assert.equal(DETAIL_COPY.itemsNeeded(0), '0 items needed');
  assert.equal(DETAIL_COPY.itemsNeeded(2), '2 items needed');
});

test('pantry + cart partial: pantry first, cart covers the remainder', () => {
  const r = recipe(ing('Eggs', 6, 'each'));
  const m = scoreRecipeWithCart(r, [row('Eggs', 2)], [row('Eggs', 4)]);
  assert.deepEqual(statuses(m), ['cart']);
  assert.equal(m.neededCount, 0);
  // Cart holds only part of the remainder: still needs the rest, worded as short.
  const short = scoreRecipeWithCart(r, [row('Eggs', 2)], [row('Eggs', 1)]);
  assert.equal(short.neededCount, 1);
  const line = short.lines[0]!;
  assert.equal(line.status, 'missing');
  assert.equal(line.status === 'missing' && line.need, 3);
  assert.equal(ingredientRowText(line).status, 'Need 3 each more (some in cart)');
  assert.deepEqual(short.stillMissing.map((l) => l.quantity), [3]);
});

test('ticked grocery rows are not cart (they are already in the pantry)', () => {
  const m = scoreRecipeWithCart(recipe(ing('Onion', 1, 'each')), [], [row('Onion', 1, 'each', { checked: true })]);
  assert.deepEqual(statuses(m), ['missing']);
  assert.equal(m.neededCount, 1);
});

test('unit conversion: cart in lb covers a recipe in oz; cups cover tbsp', () => {
  const lb = scoreRecipeWithCart(recipe(ing('Ground beef', 16, 'oz')), [], [row('Ground beef', 1, 'lb')]);
  assert.deepEqual(statuses(lb), ['cart']);
  const half = scoreRecipeWithCart(recipe(ing('Ground beef', 16, 'oz')), [], [row('Ground beef', 0.5, 'lb')]);
  assert.equal(half.neededCount, 1);
  assert.equal(half.stillMissing[0]!.quantity, 8);
  const cups = scoreRecipeWithCart(recipe(ing('Milk', 8, 'tbsp')), [], [row('Milk', 1, 'cup')]);
  assert.deepEqual(statuses(cups), ['cart']);
});

test('synonyms and notes: plural, recipe note and library ids all match the cart', () => {
  assert.deepEqual(statuses(scoreRecipeWithCart(recipe(ing('Lemons', 1, 'each')), [], [row('Lemon', 1)])), ['cart']);
  const lib = recipe(ing('Black Beans (rinsed)', 1, 'can', 'lib-chili-3'));
  const m = scoreRecipeWithCart(lib, [], [row('Black beans', 1, 'can')]);
  assert.deepEqual(statuses(m), ['cart']);
  assert.equal(m.neededCount, 0);
});

test('staples are never needed and never in the cart count', () => {
  const m = scoreRecipeWithCart(recipe(ing('Salt', 1, 'tsp'), ing('Onion', 1, 'each')), [row('Onion', 1)], []);
  assert.deepEqual(statuses(m), ['staple', 'have']);
  assert.equal(m.neededCount, 0);
});

test('add-missing is idempotent: only the remainder is added, then 0 needed', () => {
  const r = recipe(ing('Onion', 2, 'each'), ing('Lime', 2, 'each'), ing('Cilantro', 1, 'bunch'), ing('Rice', 1, 'cup'));
  const pantry = [row('Rice', 1, 'cup')];
  let cart: CartRow[] = [row('Lime', 1)]; // added on its own from the Grocery tab
  const first = scoreRecipeWithCart(r, pantry, cart);
  assert.equal(first.neededCount, 3);
  const lines = groceryLinesForMissing({ missing: first.stillMissing }, pantry);
  assert.deepEqual(lines.map((l) => [l.name, l.quantity, l.unit]), [['Onion', 2, 'each'], ['Lime', 1, 'each'], ['Cilantro', 1, 'bunch']]);
  // The server merges the lines into the list (same thing and unit add up).
  cart = [row('Lime', 2), ...lines.filter((l) => l.name !== 'Lime').map((l) => row(l.name, l.quantity, l.unit))];
  const second = scoreRecipeWithCart(r, pantry, cart);
  assert.equal(second.neededCount, 0);
  assert.deepEqual(statuses(second), ['cart', 'cart', 'cart', 'have']);
  assert.deepEqual(groceryLinesForMissing({ missing: second.stillMissing }, pantry), [], 'pressing it again adds nothing');
});

test('ready to cook stays pantry-only', () => {
  const r = recipe(ing('Onion', 1, 'each'), ing('Rice', 1, 'cup'));
  assert.equal(readyToCookCount([r], [row('Rice', 1, 'cup')]), 0);
  const m = scoreRecipeWithCart(r, [row('Rice', 1, 'cup')], [row('Onion', 1)]);
  assert.equal(m.neededCount, 0);
  assert.equal(m.pantry.missingCount, 1);
});

test('plain wording for the add result', () => {
  assert.equal(addMissingMessage({ added: 2, merged: 1, unchanged: 0 }), 'Added 3 items to your grocery list.');
  assert.equal(addMissingMessage({ added: 0, merged: 0, unchanged: 2 }), 'Already in your cart. Nothing added.');
  assert.equal(addMissingMessage({ added: 1, merged: 0, unchanged: 2 }), 'Added 1 item to your grocery list. 2 were already in your cart.');
});
