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
