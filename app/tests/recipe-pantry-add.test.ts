/// <reference types="node" />
// Recipe detail "Add to pantry": which rows get the control, what one tap saves, and the status flip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRecipeWithCart, type CartRow } from '../src/kitchen/recipeCart';
import { canAddToPantry, pantryAddForIngredient, stapleHeldInPantry } from '../src/recipes/pantryAdd';
import { DETAIL_COPY, ingredientRowText } from '../src/recipes/recipeLogic';

const slug = (n: string) => n.toLowerCase().replace(/\s+/g, '-');
const row = (name: string, quantity = 1, unit = 'each', extra: Partial<CartRow> & { category?: string } = {}) => ({
  id: `r-${slug(name)}`,
  ingredientId: slug(name),
  name,
  quantity,
  unit,
  category: 'produce',
  ...extra,
});
const ing = (name: string, quantity: number, unit: string, ingredientId = slug(name)) => ({ ingredientId, name, quantity, unit });
const recipe = (...ingredients: ReturnType<typeof ing>[]) => ({ id: 'r_1', name: 'Test', ingredients });
const controls = (m: ReturnType<typeof scoreRecipeWithCart>, pantry: readonly CartRow[]) =>
  m.lines.map((line, i) => canAddToPantry(line, m.pantry.lines[i], pantry));

test('maps a recipe line to the pantry add: cleaned name, recipe amount and unit, id kept', () => {
  const add = pantryAddForIngredient(ing('Cilantro', 1, 'bunch'));
  assert.ok(add);
  assert.equal(add.ingredientId, 'cilantro');
  assert.equal(add.fields.name, 'Cilantro');
  assert.equal(add.fields.quantity, 1);
  assert.equal(add.fields.unit, 'bunch');
  assert.equal(add.fields.expiresOn, null);
  assert.ok(add.fields.category);
  assert.ok(add.fields.location);
});

test('drops the recipe note from the name, defaults amount and unit, slugs library ids', () => {
  const add = pantryAddForIngredient(ing('onion (diced)', 0, ' ', 'lib-soup-3'));
  assert.ok(add);
  assert.equal(add.fields.name, 'onion');
  assert.equal(add.fields.quantity, 1);
  assert.equal(add.fields.unit, 'each');
  assert.ok(!add.ingredientId.startsWith('lib-'));
  assert.equal(pantryAddForIngredient(ing('   ', 1, 'each')), null);
});

test('reuses the category of a pantry row for the same ingredient id', () => {
  const add = pantryAddForIngredient(ing('Lime', 2, 'each'), [row('Lime', 1, 'each', { category: 'custom_cat' })]);
  assert.equal(add?.fields.category, 'custom_cat');
});

test('control shows on Missing and In cart rows, not In pantry or partly stocked rows', () => {
  const pantry = [row('Spaghetti', 1, 'lb'), row('Beef', 0.5, 'lb')];
  const cart = [row('Lime', 2, 'each')];
  const m = scoreRecipeWithCart(
    recipe(ing('Spaghetti', 1, 'lb'), ing('Beef', 1, 'lb'), ing('Cilantro', 1, 'bunch'), ing('Lime', 2, 'each')),
    pantry,
    cart,
  );
  assert.deepEqual(m.lines.map((l) => l.status), ['have', 'missing', 'missing', 'cart']);
  assert.deepEqual(controls(m, pantry), [false, false, true, true]);
});

test('a staple (olive oil) gets the control until the pantry holds it, then reads In pantry', () => {
  const r = recipe(ing('Olive oil', 2, 'tbsp'), ing('Water', 1, 'cup'));
  const before = scoreRecipeWithCart(r, [], []);
  assert.deepEqual(before.lines.map((l) => l.status), ['staple', 'staple']);
  assert.deepEqual(controls(before, []), [true, false]);
  assert.equal(ingredientRowText(before.lines[0]!, stapleHeldInPantry(before.lines[0]!, [])).status, DETAIL_COPY.staple);

  const pantry = [row('Olive oil', 2, 'tbsp')];
  const after = scoreRecipeWithCart(r, pantry, []);
  assert.deepEqual(controls(after, pantry), [false, false]);
  assert.equal(ingredientRowText(after.lines[0]!, stapleHeldInPantry(after.lines[0]!, pantry)).status, 'In pantry');
});

test('after the add the row flips to In pantry, counts update, and a cart row is not counted twice', () => {
  const r = recipe(ing('Cilantro', 1, 'bunch'), ing('Lime', 2, 'each'));
  const cart = [row('Cilantro', 1, 'bunch')];
  const before = scoreRecipeWithCart(r, [], cart);
  assert.equal(before.neededCount, 1);
  assert.equal(before.inCartCount, 1);
  assert.equal(before.inPantryCount, 0);

  const add = pantryAddForIngredient(r.ingredients[0]!)!;
  const added = row(add.fields.name, add.fields.quantity, add.fields.unit, { ingredientId: add.ingredientId });
  const after = scoreRecipeWithCart(r, [added], cart);
  assert.equal(after.lines[0]!.status, 'have');
  assert.equal(ingredientRowText(after.lines[0]!).status, 'In pantry');
  assert.equal(after.inPantryCount, 1);
  assert.equal(after.inCartCount, 0); // the open cart row is not counted again
  assert.equal(after.neededCount, 1); // Lime
  assert.equal(DETAIL_COPY.breakdown(after.inPantryCount, after.inCartCount), '1 in pantry · 0 in cart');
  assert.equal(DETAIL_COPY.itemsNeeded(after.neededCount), '1 item needed');
});
