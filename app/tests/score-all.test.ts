/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAllCached, scoreRecipesInChunks } from '../src/kitchen/scoreAll';
import { readyToCookCount, rankRecipeFeed } from '../src/kitchen/recipeFeed';
import { scoreRecipeAgainstPantry } from '../src/kitchen/recipeMatch';
import { homeCounts } from '../src/home/counts';

const names = ['butter', 'garlic', 'basil', 'lemon', 'flour', 'eggs', 'milk', 'rice', 'onion', 'salmon'];
const recipes = Array.from({ length: 80 }, (_, i) => ({
  id: `l_${i}`,
  name: `Dish ${i}`,
  ingredients: [0, 1, 2, 3].map((j) => ({ ingredientId: `lib-${i}-${j}`, name: names[(i + j * 3) % names.length]! + (j === 3 ? ` extra${i}` : ''), quantity: 1, unit: 'each' })),
}));
const pantry = names.slice(0, 6).map((n, i) => ({ id: `p${i}`, ingredientId: n, name: n, quantity: 1, unit: 'each', category: 'x' }));

test('chunked scoring gives the same matches as scoring directly, and yields to the screen', async () => {
  let yields = 0;
  const timer = setInterval(() => (yields += 1), 0);
  const scored = await scoreRecipesInChunks(recipes, pantry, { sliceMs: 0 });
  clearInterval(timer);
  assert.equal(scored.size, recipes.length);
  for (const r of recipes) assert.deepEqual(scored.get(r.id), scoreRecipeAgainstPantry(r, pantry));
  assert.ok(yields > 0, 'other work ran between slices');
});

test('ranking and Home count are identical with precomputed matches', async () => {
  const scored = await scoreRecipesInChunks(recipes, pantry);
  const a = rankRecipeFeed(recipes, pantry, { seed: 's', cookableLimit: 100, moreLimit: 100 });
  const b = rankRecipeFeed(recipes, pantry, { seed: 's', cookableLimit: 100, moreLimit: 100, scoredById: scored });
  assert.deepEqual(b, a);
  assert.equal(readyToCookCount(recipes, pantry, scored), readyToCookCount(recipes, pantry));
  assert.equal(homeCounts({ recipes, pantry, grocery: [], scoredById: scored }).ready, readyToCookCount(recipes, pantry));
  assert.equal(homeCounts({ recipes, pantry, grocery: [], scoredById: null }).ready, null, 'not ready while scoring');
});

test('a newer pantry cancels the older run; the same pair shares one run', async () => {
  const p2 = [...pantry];
  const first = scoreAllCached(recipes, pantry);
  assert.equal(scoreAllCached(recipes, pantry), first);
  const second = scoreAllCached(recipes, p2);
  await assert.doesNotReject(second);
});
