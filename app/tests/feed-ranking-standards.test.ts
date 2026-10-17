/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankRecipeFeed } from '../src/kitchen/recipeFeed';

const line = (r: string, i: number, name: string) => ({ ingredientId: `lib-${r}-${i}`, name, quantity: 1, unit: 'each' });
const pantry = ['butter', 'garlic', 'basil', 'lemon'].map((n, i) => ({ id: `p${i}`, ingredientId: n, name: n, quantity: 1, unit: 'each', category: 'x' }));

// "close": uses 2 pantry items plus `missing` things the pantry lacks.
const recipe = (id: string, have: string[], missing: number) => ({
  id,
  name: id,
  ingredients: [...have.map((n, i) => line(id, i, n)), ...Array.from({ length: missing }, (_, i) => line(id, 50 + i, `zzfood${id}${i}`))],
});

test('close recipes rank on merit; ready first, then fewest missing', () => {
  const recipes = [recipe('three-missing', ['butter', 'garlic'], 3), recipe('ready', ['butter', 'garlic'], 0), recipe('one-missing', ['butter', 'garlic'], 1)];
  const feed = rankRecipeFeed(recipes, pantry, { seed: '2026-10-16' });
  assert.deepEqual(feed.cookable.map((e) => e.recipe.id), ['ready', 'one-missing', 'three-missing']);
});

test('recipes 4+ missing come after close ones, in a daily rotation', () => {
  const far = Array.from({ length: 12 }, (_, i) => recipe(`far${i}`, ['butter', 'garlic'], 4 + (i % 3)));
  const recipes = [...far, recipe('close', ['butter', 'garlic'], 2)];
  const day1 = rankRecipeFeed(recipes, pantry, { seed: '2026-10-16' }).cookable.map((e) => e.recipe.id);
  const day1again = rankRecipeFeed([...recipes].reverse(), pantry, { seed: '2026-10-16' }).cookable.map((e) => e.recipe.id);
  const day2 = rankRecipeFeed(recipes, pantry, { seed: '2026-10-17' }).cookable.map((e) => e.recipe.id);
  assert.equal(day1[0], 'close');
  assert.deepEqual(day1, day1again, 'same day, same order, whatever the input order');
  assert.notDeepEqual(day1, day2, 'next day, different order');
  assert.equal(new Set(day2).size, 13);
});

import { scoreRecipeAgainstPantry } from '../src/kitchen/recipeMatch';
import { isComponentRecipe } from '../src/kitchen/recipeFeed';
import { libraryIngredientsFromJson } from '../src/data/recipeRows';
import { ingredientRowText } from '../src/recipes/recipeLogic';

test('an optional ingredient never counts as missing or matched, and reads "Optional"', () => {
  const r = {
    id: 'l_opt',
    name: 'Garlic butter',
    ingredients: [line('opt', 0, 'butter'), line('opt', 1, 'garlic'), line('opt', 2, 'lemon juice (optional)'), line('opt', 3, 'parsley, optional')],
  };
  const m = scoreRecipeAgainstPantry(r, pantry.slice(0, 2));
  assert.equal(m.missingCount, 0);
  assert.equal(m.matchedCount, 2);
  assert.equal(m.totalIngredients, 2);
  const row = ingredientRowText(m.lines[3] as never);
  assert.equal(row.status, 'Optional');
});

test('a note that already has brackets is not wrapped twice', () => {
  const [a, b] = libraryIngredientsFromJson([{ name: 'water', note: '(60 ml)', quantity: 0.25, unit: 'cup' }, { name: 'onion', note: 'diced', quantity: 1, unit: 'each' }], 's');
  assert.equal(a!.name, 'water (60 ml)');
  assert.equal(b!.name, 'onion (diced)');
});

test('with the same number missing, a meal ranks before a sauce or drink', () => {
  const sauce = { ...recipe('a-sauce', ['butter', 'garlic'], 0), tags: ['sauce'] };
  const meal = { ...recipe('b-meal', ['butter', 'garlic'], 0), tags: ['pasta'] };
  const feed = rankRecipeFeed([sauce, meal], pantry, { seed: 's', isComponent: isComponentRecipe });
  assert.deepEqual(feed.cookable.map((e) => e.recipe.id), ['b-meal', 'a-sauce']);
  const plain = rankRecipeFeed([sauce, meal], pantry, { seed: 's' });
  assert.deepEqual(plain.cookable.map((e) => e.recipe.id), ['a-sauce', 'b-meal'], 'without the rule it is name order');
});
