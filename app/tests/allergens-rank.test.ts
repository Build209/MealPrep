/// <reference types="node" />
// Ordering with and without allergens: feed, search, copy, saved-preferences rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLERGEN_COPY, containsLine } from '../src/allergens/copy';
import { demoteFlaggedResults, partitionByAllergens, rankFeedWithAllergens } from '../src/allergens/rank';
import { cleanDiets, EMPTY_PREFS, prefsFromRow, rowFromPrefs } from '../src/allergens/prefsRows';
import { rankRecipeFeed } from '../src/kitchen/recipeFeed';

const ing = (name: string) => ({ ingredientId: name.replace(/ /g, '-'), name, quantity: 1, unit: 'each' });
const recipe = (id: string, ...names: string[]) => ({ id, name: id, ingredients: names.map(ing) });
const pantryRow = (name: string) => ({ id: `p-${name}`, ingredientId: name, name, quantity: 1, unit: 'each', category: 'produce' });

const recipes = [
  recipe('satay', 'peanut butter', 'chicken', 'soy sauce'),
  recipe('chicken-rice', 'chicken', 'rice', 'garlic'),
  recipe('mac', 'macaroni', 'cheese', 'milk'),
  recipe('salad', 'lettuce', 'tomato', 'olive oil'),
  recipe('curry', 'coconut milk', 'chicken', 'rice'),
];
const pantry = [pantryRow('chicken'), pantryRow('rice'), pantryRow('garlic')];

test('no allergens: identical to the plain feed, nothing flagged', () => {
  const plain = rankRecipeFeed(recipes, pantry);
  const feed = rankFeedWithAllergens(recipes, pantry, []);
  assert.deepEqual(feed.cookable, plain.cookable);
  assert.deepEqual(feed.more, plain.more);
  assert.deepEqual(feed.flagged, []);
  assert.equal(feed.flaggedHidden, 0);
});

test('allergens: flagged recipes leave the main lists and come last with their allergens', () => {
  const feed = rankFeedWithAllergens(recipes, pantry, ['peanuts', 'milk']);
  const shown = [...feed.cookable, ...feed.more].map((e) => e.recipe.id);
  assert.ok(!shown.includes('satay') && !shown.includes('mac'));
  assert.ok(shown.includes('chicken-rice') && shown.includes('curry') && shown.includes('salad'));
  const flagged = Object.fromEntries(feed.flagged.map((e) => [e.recipe.id, e.allergens]));
  assert.deepEqual(flagged, { satay: ['peanuts'], mac: ['milk'] });
});

test('the rest keep the order the plain feed gives them', () => {
  const plain = rankRecipeFeed(
    recipes.filter((r) => r.id !== 'satay' && r.id !== 'mac'),
    pantry,
  );
  const feed = rankFeedWithAllergens(recipes, pantry, ['peanuts', 'milk']);
  assert.deepEqual(feed.cookable.map((e) => e.recipe.id), plain.cookable.map((e) => e.recipe.id));
  assert.deepEqual(feed.more.map((e) => e.recipe.id), plain.more.map((e) => e.recipe.id));
});

test('an allergen no recipe uses changes nothing', () => {
  const feed = rankFeedWithAllergens(recipes, pantry, ['sesame']);
  assert.deepEqual(feed.flagged, []);
  assert.deepEqual(feed.cookable, rankRecipeFeed(recipes, pantry).cookable);
});

test('flagged group is capped and says how many are hidden', () => {
  const many = Array.from({ length: 5 }, (_, i) => recipe(`pb${i}`, 'peanuts'));
  const feed = rankFeedWithAllergens(many, pantry, ['peanuts'], { flaggedLimit: 2 });
  assert.equal(feed.flagged.length, 2);
  assert.equal(feed.flaggedHidden, 3);
  assert.equal(feed.cookable.length + feed.more.length, 0);
});

test('partitionByAllergens is stable', () => {
  const { clear, flagged } = partitionByAllergens(recipes, ['soy'], (r) => r.ingredients);
  assert.deepEqual(clear.map((r) => r.id), ['chicken-rice', 'mac', 'salad', 'curry']);
  assert.deepEqual(flagged.map((f) => f.item.id), ['satay']);
});

test('search: flagged recipes go after everything else (videos stay in place); no allergens keeps order', () => {
  type Item = { kind: 'recipe'; id: string; ingredients: { name: string }[] } | { kind: 'video'; id: string };
  const items: Item[] = [
    { kind: 'recipe', id: 'a', ingredients: [ing('peanuts')] },
    { kind: 'video', id: 'v1' },
    { kind: 'recipe', id: 'b', ingredients: [ing('rice')] },
    { kind: 'recipe', id: 'c', ingredients: [ing('milk')] },
  ];
  const of = (i: Item) => (i.kind === 'recipe' ? i.ingredients : null);
  assert.deepEqual(demoteFlaggedResults(items, [], of).items.map((i) => i.id), ['a', 'v1', 'b', 'c']);
  const r = demoteFlaggedResults(items, ['peanuts', 'milk'], of);
  assert.deepEqual(r.items.map((i) => i.id), ['v1', 'b', 'a', 'c']);
  assert.deepEqual(r.allergensOf.get(items[0]!), ['peanuts']);
  assert.equal(r.allergensOf.has(items[1]!), false);
});

test('copy: contains line, and no safe/free/guaranteed claims', () => {
  assert.equal(containsLine(['peanuts', 'milk']), 'Contains: peanuts, milk');
  assert.equal(containsLine(['tree-nuts']), 'Contains: tree nuts');
  assert.equal(containsLine([]), '');
  const all = [ALLERGEN_COPY.flaggedTitle, ALLERGEN_COPY.flaggedIntro, ALLERGEN_COPY.flaggedHidden(1), ALLERGEN_COPY.flaggedHidden(3)].join(' ');
  assert.doesNotMatch(all, /\b(safe|allergen[- ]free|guarantee\w*)\b/i);
  assert.match(ALLERGEN_COPY.flaggedIntro, /check labels/i);
  assert.match(ALLERGEN_COPY.flaggedIntro, /verify before you cook/i);
});

test('prefs rows: unknown allergens ignored, empty on no row, upsert row is clean', () => {
  assert.deepEqual(prefsFromRow(null), { allergens: [], diets: [] });
  assert.deepEqual(prefsFromRow({ allergens: ['soy', 'kiwi', 'milk'], diets: ['vegan', ' ', 'vegan', 3] }), { allergens: ['milk', 'soy'], diets: ['vegan'] });
  assert.deepEqual(prefsFromRow({ allergens: 'oops', diets: null }), { allergens: [], diets: [] });
  assert.deepEqual(rowFromPrefs('u1', { allergens: ['soy', 'milk', 'soy'], diets: ['vegan'] }), { user_id: 'u1', diets: ['vegan'], allergens: ['milk', 'soy'] });
  assert.deepEqual(cleanDiets(undefined), []);
  assert.equal(EMPTY_PREFS.allergens.length, 0);
});
