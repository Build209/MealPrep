/// <reference types="node" />
// Home's counters: ready-to-cook recipes (same scoring as the feed's "Ready to cook" sticker),
// pantry rows, and grocery rows not ticked yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_COPY } from '../src/home/copy';
import { homeCounts } from '../src/home/counts';
import { rankRecipeFeed, readyToCookCount, recipeStatus, recipeStatusLabel } from '../src/kitchen/recipeFeed';

const row = (name: string, quantity = 1, unit = 'each') => ({
  id: `p-${name}`,
  ingredientId: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  quantity,
  unit,
});
const line = (name: string, quantity = 1, unit = 'each') => ({
  ingredientId: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  quantity,
  unit,
});

const recipes = [
  { id: 'ready', name: 'Egg rice', ingredients: [line('Eggs', 2), line('White rice', 1, 'cup'), line('Salt', 1, 'tsp')] },
  { id: 'missing', name: 'Fried rice', ingredients: [line('Eggs', 2), line('White rice', 1, 'cup'), line('Scallions', 3)] },
  { id: 'short', name: 'Big omelette', ingredients: [line('Eggs', 24)] },
  { id: 'staples', name: 'Salt water', ingredients: [line('Salt', 1, 'tsp'), line('Water', 1, 'cup')] },
  { id: 'empty', name: 'Nothing listed', ingredients: [] },
];
const pantry = [row('Eggs', 12), row('White rice', 2, 'cup')];

test('ready to cook: nothing missing and at least one pantry ingredient; staples-only and empty recipes do not count', () => {
  assert.equal(readyToCookCount(recipes, pantry), 1);
  assert.equal(readyToCookCount(recipes, []), 0, 'an empty pantry cooks nothing');
  assert.equal(readyToCookCount([], pantry), 0);
});

test('every counted recipe wears the "Ready to cook" sticker in the feed', () => {
  const feed = rankRecipeFeed(recipes, pantry, { moreLimit: 100 });
  const all = [...feed.cookable, ...feed.more];
  const counted = all.filter((e) => e.match.missingCount === 0 && e.match.matchedCount >= 1);
  assert.equal(counted.length, readyToCookCount(recipes, pantry));
  for (const e of counted) assert.equal(recipeStatusLabel(recipeStatus(e.match)), 'Ready to cook');
});

test('homeCounts: unknown until loaded; grocery counts only rows not ticked', () => {
  assert.deepEqual(homeCounts({ recipes: undefined, pantry: undefined, grocery: undefined }), { ready: null, pantry: null, grocery: null });
  assert.deepEqual(homeCounts({ recipes: undefined, pantry, grocery: [] }), { ready: null, pantry: 2, grocery: 0 });
  assert.deepEqual(
    homeCounts({ recipes, pantry, grocery: [{ checked: false }, { checked: true }, { checked: false }] }),
    { ready: 1, pantry: 2, grocery: 2 },
  );
});

test('the recipes counter name is one copy line (owner may rename it)', () => {
  assert.equal(HOME_COPY.readyToCook, 'Ready to cook');
  assert.equal(HOME_COPY.counterA11y(HOME_COPY.readyToCook, '3', 'Recipes'), 'Ready to cook: 3. Opens Recipes.');
});

test('Home does not count the one-and-two-ingredient library recipes the list hides', () => {
  const thin = { id: 'l_thin', name: 'Boiled eggs', ingredients: [{ ingredientId: 'eggs', name: 'Eggs', quantity: 2, unit: 'each' }] };
  const meal = {
    id: 'l_meal',
    name: 'Egg fried rice',
    ingredients: [
      { ingredientId: 'eggs', name: 'Eggs', quantity: 2, unit: 'each' },
      { ingredientId: 'rice', name: 'White rice', quantity: 1, unit: 'cup' },
      { ingredientId: 'salt', name: 'Salt', quantity: 1, unit: 'tsp' },
    ],
  };
  assert.equal(readyToCookCount([thin, meal], pantry), 2, 'the plain rule counts both');
  assert.equal(homeCounts({ recipes: [thin, meal], pantry, grocery: [] }).ready, 1, 'Home counts what the list can show');
});
