/// <reference types="node" />
// The Home feed ranking, status stickers and the grocery lines for "Add N missing".
// Old app sources: mobile/lib/recipeMatch/match.ts (ranking and partial fallback) and
// mobile/lib/recipeMatch/groceryFromMissing.ts (missing lines -> grocery rows, category).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groceryIngredientIdFor,
  groceryLinesForMissing,
  groceryNameFor,
  matchRecipe,
  rankRecipeFeed,
  recipeStatus,
  recipeStatusLabel,
} from '../src/kitchen/recipeFeed';
import { addMissingMessage, DETAIL_COPY, ingredientRowText } from '../src/recipes/recipeLogic';
import { LIVE_RECIPES } from './fixtures/liveRecipes';

const recipes = LIVE_RECIPES.map((r) => ({ id: r.slug, name: r.name, ingredients: r.ingredients }));
const slug = (n: string) => n.toLowerCase().replace(/\s+/g, '-');
const pantryRow = (name: string, quantity = 1, unit = 'each', category = 'produce') => ({
  id: `p-${slug(name)}`,
  ingredientId: slug(name),
  name,
  quantity,
  unit,
  category,
});

test('feed: cookable first (two or more pantry ingredients), the rest under More, nothing lost', () => {
  const pantry = ['chicken breast', 'jasmine rice', 'onion', 'garlic', 'bell pepper'].map((n) => pantryRow(n));
  const feed = rankRecipeFeed(recipes, pantry, { moreLimit: 100 });
  assert.ok(feed.cookable.length >= 1);
  assert.equal(feed.usedPartialFallback, false);
  assert.ok(feed.cookable.every((e) => e.match.matchedCount >= 2));
  assert.ok(feed.cookable.some((e) => e.recipe.name.includes('Lemon Herb Chicken')));
  assert.equal(feed.cookable.length + feed.more.length, recipes.length, 'every recipe appears once');
  const ids = new Set([...feed.cookable, ...feed.more].map((e) => e.recipe.id));
  assert.equal(ids.size, recipes.length);
  for (let i = 1; i < feed.more.length; i++) {
    assert.ok(feed.more[i - 1]!.match.missingCount <= feed.more[i]!.match.missingCount, 'More is fewest missing first');
  }
});

test('feed: partial fallback when nothing reaches two; empty pantry has no cookable list', () => {
  const partial = rankRecipeFeed(recipes, [pantryRow('Broccoli crowns')]);
  assert.ok(partial.cookable.length >= 1);
  assert.equal(partial.usedPartialFallback, true);

  const empty = rankRecipeFeed(recipes, [], { moreLimit: 5 });
  assert.equal(empty.cookable.length, 0);
  assert.equal(empty.more.length, 5);
  assert.equal(empty.moreHidden, recipes.length - 5);
});

test('status sticker: ready to cook, or N missing', () => {
  const recipe = {
    id: 'r1',
    name: 'Rice and eggs',
    ingredients: [
      { ingredientId: 'rice', name: 'Rice', quantity: 1, unit: 'cup' },
      { ingredientId: 'eggs', name: 'Eggs', quantity: 2, unit: 'each' },
      { ingredientId: 'salt', name: 'Salt', quantity: 1, unit: 'tsp' },
    ],
  };
  const ready = matchRecipe(recipe, [pantryRow('Rice', 2, 'cup', 'dry_goods'), pantryRow('Eggs', 12, 'each', 'dairy')]);
  assert.deepEqual(recipeStatus(ready), { kind: 'ready' });
  assert.equal(recipeStatusLabel(recipeStatus(ready)), 'Ready to cook');

  const partial = matchRecipe(recipe, [pantryRow('Rice', 2, 'cup', 'dry_goods')]);
  assert.deepEqual(recipeStatus(partial), { kind: 'missing', count: 1 });
  assert.equal(recipeStatusLabel(recipeStatus(partial)), '1 missing');
  assert.deepEqual(partial.lines.map((l) => l.status), ['have', 'missing', 'staple']);
});

test('grocery lines: shortfall quantity, category from the pantry or the name, library ids become slugs', () => {
  const recipe = {
    id: 'l_x',
    name: 'Omelette',
    ingredients: [
      { ingredientId: 'lib-omelette-0', name: 'Eggs', quantity: 6, unit: 'each' },
      { ingredientId: 'lib-omelette-1', name: 'Cheddar cheese (shredded)', quantity: 0.5, unit: 'cup' },
      { ingredientId: 'lib-omelette-2', name: 'Chives', quantity: 0, unit: '' },
      { ingredientId: 'lib-omelette-3', name: 'Water', quantity: 1, unit: 'tbsp' },
    ],
  };
  const pantry = [pantryRow('Eggs', 2, 'each', 'dairy')];
  const match = matchRecipe(recipe, pantry);
  assert.equal(match.missingCount, 3);
  const lines = groceryLinesForMissing(match, pantry);
  assert.deepEqual(lines, [
    { ingredientId: 'egg', name: 'Eggs', category: 'dairy', quantity: 4, unit: 'each' },
    { ingredientId: 'cheddar-cheese', name: 'Cheddar cheese', category: 'dairy', quantity: 0.5, unit: 'cup' },
    { ingredientId: 'chive', name: 'Chives', category: 'dry_goods', quantity: 1, unit: 'each' }, // old aisle guess
  ]);
});

test('grocery lines: two lines of the same thing and unit become one row', () => {
  const lines = groceryLinesForMissing(
    {
      missing: [
        { ingredientId: 'onion', name: 'Onion', quantity: 1, unit: 'each' },
        { ingredientId: 'onion', name: 'Onion', quantity: 2, unit: 'Each' },
        { ingredientId: 'onion', name: 'Onion', quantity: 1, unit: 'cup' },
      ],
    },
    [],
  );
  assert.deepEqual(lines.map((l) => [l.name, l.quantity, l.unit]), [
    ['Onion', 3, 'each'],
    ['Onion', 1, 'cup'],
  ]);
});

test('names and ids for grocery rows', () => {
  assert.equal(groceryNameFor('Onion (diced)'), 'Onion');
  assert.equal(groceryNameFor('(optional)'), '(optional)');
  assert.equal(groceryIngredientIdFor({ ingredientId: 'green-beans', name: 'Green beans' }), 'green-beans');
  assert.equal(groceryIngredientIdFor({ ingredientId: 'lib-x-3', name: 'Black Beans (rinsed)' }), 'black-beans');
  assert.equal(groceryIngredientIdFor({ ingredientId: ' ', name: 'Lemons' }), 'lemon');
});

test('detail wording: ingredient rows and the add result', () => {
  const have = ingredientRowText({ status: 'have', ingredient: { ingredientId: 'r', name: 'Rice', quantity: 0.75, unit: 'cup' }, pantryItem: { id: 'p', ingredientId: 'r', name: 'Rice', quantity: 1, unit: 'cup' } });
  assert.deepEqual(have, { name: 'Rice', amount: '¾ cup', status: 'You have it' });
  const short = ingredientRowText({ status: 'missing', ingredient: { ingredientId: 'e', name: 'Eggs', quantity: 6, unit: 'each' }, need: 4, short: true });
  assert.equal(short.status, 'Need 4 each more');
  const missing = ingredientRowText({ status: 'missing', ingredient: { ingredientId: 'c', name: 'Chives', quantity: 0, unit: '' }, need: 0, short: false });
  assert.deepEqual(missing, { name: 'Chives', amount: '', status: 'Missing' });
  assert.equal(DETAIL_COPY.addMissing(1), 'Add 1 missing to grocery list');
  assert.equal(DETAIL_COPY.addMissing(3), 'Add 3 missing to grocery list');
  assert.equal(addMissingMessage({ added: 2, merged: 1, unchanged: 0 }), 'Added 3 items to your grocery list.');
  assert.equal(addMissingMessage({ added: 0, merged: 0, unchanged: 2 }), 'Already on your grocery list.');
  assert.ok(DETAIL_COPY.checkLabels.includes('verify before you cook'), 'compliance rule 9 wording');
});
