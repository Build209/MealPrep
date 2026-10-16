/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingredientNames, isOpenableRecipeId, rankShortlist, recipeButtons } from '../src/forky/shortlist';

const R1 = 'r_11111111-1111-4111-8111-111111111111';
const L1 = 'l_22222222-2222-4222-8222-222222222222';

const pantry = [
  { id: 'p1', ingredientId: 'eggs', name: 'Eggs', quantity: 12, unit: 'each' },
  { id: 'p2', ingredientId: 'white-rice', name: 'White Rice', quantity: 2, unit: 'cup' },
  { id: 'p3', ingredientId: 'soy-sauce', name: 'Soy Sauce', quantity: 1, unit: 'bottle' },
];

test('only r_/l_ route ids with a uuid can be opened', () => {
  assert.equal(isOpenableRecipeId(R1), true);
  assert.equal(isOpenableRecipeId(L1), true);
  assert.equal(isOpenableRecipeId('mealdb-52772'), false);
  assert.equal(isOpenableRecipeId('lib-fried-rice'), false);
  assert.equal(isOpenableRecipeId('r_not-a-uuid'), false);
});

test('ingredient names from either table\'s jsonb', () => {
  assert.deepEqual(ingredientNames([{ ingredientId: 'eggs', name: 'Eggs', quantity: 2 }, { name: ' Rice ' }, 'Salt', { quantity: 1 }, null]), ['Eggs', 'Rice', 'Salt']);
  assert.deepEqual(ingredientNames('nope'), []);
});

test('best pantry matches first, missing names listed, empty recipes left out', () => {
  const ranked = rankShortlist(
    [
      { id: 'r_a', title: 'Pancakes', ingredients: ['Flour', 'Milk', 'Eggs', 'Butter'] },
      { id: R1, title: 'Fried rice', ingredients: ['Eggs', 'White rice', 'Soy sauce', 'Peas'] },
      { id: 'r_empty', title: 'Nothing', ingredients: [] },
      { id: R1, title: 'Duplicate', ingredients: ['Eggs'] },
    ],
    pantry,
  );
  assert.deepEqual(ranked.map((r) => r.id), [R1, 'r_a']);
  assert.deepEqual(ranked[0], { id: R1, title: 'Fried rice', have: 3, total: 4, missing: ['Peas'] });
  assert.equal(ranked[1]!.have, 1);
});

test('at most 8; an empty pantry still sends recipes (nothing on hand)', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `r_${i}`, title: `R${String(i).padStart(2, '0')}`, ingredients: ['Flour'] }));
  const ranked = rankShortlist(many, []);
  assert.equal(ranked.length, 8);
  assert.equal(ranked[0]!.have, 0);
});

test('recipe buttons: on the shortlist and openable, no repeats, at most 3', () => {
  const shortlist = [
    { id: R1, title: 'Fried rice' },
    { id: L1, title: 'Shakshuka' },
    { id: 'r_bad', title: 'Old id' },
  ];
  assert.deepEqual(recipeButtons([R1, R1, 'r_bad', 'l_33333333-3333-4333-8333-333333333333', L1], shortlist), [
    { id: R1, title: 'Fried rice', href: `/recipe/${R1}` },
    { id: L1, title: 'Shakshuka', href: `/recipe/${L1}` },
  ]);
  assert.deepEqual(recipeButtons([], shortlist), []);
});

test('recipes with the person\'s allergens never reach the shortlist, and do not use up a slot', () => {
  const recipes = [
    { id: R1, title: 'Peanut noodles', ingredients: ['peanut butter', 'rice'] },
    { id: L1, title: 'Fried rice', ingredients: ['rice', 'eggs', 'soy sauce'] },
    { id: 'r_33333333-3333-4333-8333-333333333333', title: 'Plain rice', ingredients: ['white rice'] },
  ];
  const none = rankShortlist(recipes, pantry);
  assert.equal(none.length, 3, 'no allergens: nothing is removed');
  assert.deepEqual(rankShortlist(recipes, pantry, 8, []).map((r) => r.id), none.map((r) => r.id));
  assert.deepEqual(rankShortlist(recipes, pantry, 8, ['peanuts']).map((r) => r.title).sort(), ['Fried rice', 'Plain rice']);
  assert.deepEqual(rankShortlist(recipes, pantry, 8, ['eggs', 'peanuts']).map((r) => r.title), ['Plain rice']);
  // Flagged recipes are removed before the cap.
  assert.deepEqual(rankShortlist(recipes, pantry, 1, ['eggs']).length, 1);
  assert.notEqual(rankShortlist(recipes, pantry, 2, ['peanuts', 'eggs'])[0]?.title, 'Fried rice');
});
