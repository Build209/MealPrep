/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRecipeNutrition } from '../src/nutrition/nutritionMath';
import { MAX_LOOKUPS_PER_RECIPE, planIngredients } from '../src/nutrition/plan';
import { pickBestFood, type Per100g } from '../src/nutrition/usdaParse';
import { SEARCH } from './fixtures/usda/search-fixtures';

const FLOUR: Per100g = { kcal: 364, proteinG: 10.3, fatG: 1, carbsG: 76.3 };
const OIL: Per100g = { kcal: 884, proteinG: 0, fatG: 100, carbsG: 0 };

test('sums lines and divides by servings, rounding kcal to 5 and grams to 1 decimal', () => {
  const r = computeRecipeNutrition(
    [
      { grams: 250, per100g: FLOUR }, // 910 kcal
      { grams: 30, per100g: OIL }, // 265.2 kcal
    ],
    4,
  );
  assert.equal(r.status, 'ready');
  if (r.status !== 'ready') return;
  assert.equal(r.perServing.calories, 295); // 1175.2 / 4 = 293.8 -> 295
  assert.equal(r.perServing.proteinG, 6.4); // 25.75 / 4
  assert.equal(r.perServing.fatG, 8.1); // (2.5 + 30) / 4
  assert.equal(r.perServing.carbsG, 47.7); // 190.75 / 4
  assert.equal(r.usedIngredients, 2);
  assert.equal(r.totalIngredients, 2);
});

test('null, zero or negative servings count as 1', () => {
  const one = computeRecipeNutrition([{ grams: 100, per100g: FLOUR }], 1);
  for (const s of [null, undefined, 0, -3, Number.NaN]) {
    assert.deepEqual(computeRecipeNutrition([{ grams: 100, per100g: FLOUR }], s), one);
  }
  assert.equal(one.status === 'ready' && one.perServing.calories, 365);
});

test('exactly half resolved is ready; fewer than half is not-enough-data', () => {
  const ok = { grams: 100, per100g: FLOUR };
  const miss = { grams: null, per100g: null };
  assert.equal(computeRecipeNutrition([ok, miss], 1).status, 'ready');
  assert.equal(computeRecipeNutrition([ok, ok, ok, miss, miss], 1).status, 'ready');
  assert.equal(computeRecipeNutrition([ok, ok, miss, miss, miss], 1).status, 'not-enough-data');
  const low = computeRecipeNutrition([ok, miss, miss], 1);
  assert.deepEqual(low, { status: 'not-enough-data', usedIngredients: 1, totalIngredients: 3 });
});

test('a line with grams but no facts (or facts but no grams) is not used', () => {
  const r = computeRecipeNutrition(
    [
      { grams: 100, per100g: null },
      { grams: null, per100g: FLOUR },
    ],
    1,
  );
  assert.deepEqual(r, { status: 'not-enough-data', usedIngredients: 0, totalIngredients: 2 });
});

test('no ingredients is not-enough-data, never zeros', () => {
  assert.deepEqual(computeRecipeNutrition([], 4), { status: 'not-enough-data', usedIngredients: 0, totalIngredients: 0 });
});

test('totalIngredients can exceed the lines passed (ingredients past the lookup cap)', () => {
  const ok = { grams: 100, per100g: FLOUR };
  const r = computeRecipeNutrition([ok, ok], 1, 5);
  assert.equal(r.status, 'not-enough-data');
});

test('planIngredients: normalises names, skips unconvertible lines, dedupes lookups', () => {
  const plan = planIngredients([
    { name: 'All-purpose flour', quantity: 2, unit: 'cups' },
    { name: 'Unsalted Butter', quantity: 4, unit: 'tbsp' },
    { name: 'butter', quantity: 1, unit: 'tbsp' },
    { name: 'Dragon fruit puree', quantity: 1, unit: 'cup' },
    { name: 'salt', quantity: null, unit: null },
  ]);
  assert.deepEqual(plan.labels, ['all-purpose flour', 'butter']);
  assert.deepEqual(plan.lines.map((l) => l.lookup), [true, true, true, false, false]);
  assert.equal(plan.lines[3]?.grams, null);
});

test('planIngredients caps lookups per recipe', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ name: `ingredient${String.fromCharCode(97 + (i % 26))}${i} flour`, quantity: 1, unit: 'cup' }));
  const plan = planIngredients(many);
  assert.equal(plan.labels.length, MAX_LOOKUPS_PER_RECIPE);
  assert.equal(plan.lines.filter((l) => l.lookup).length, MAX_LOOKUPS_PER_RECIPE);
});

test('end to end on fixtures: a pancake-style recipe', () => {
  const ingredients = [
    { name: 'all-purpose flour', quantity: 2, unit: 'cups' }, // 250 g
    { name: 'large eggs', quantity: 2, unit: '' }, // 100 g
    { name: 'whole milk', quantity: 1.5, unit: 'cups' }, // ~365.6 g
    { name: 'unsalted butter', quantity: 4, unit: 'tbsp' }, // ~56.8 g
    { name: 'sugar', quantity: 2, unit: 'tbsp' }, // ~25.2 g
    { name: 'fresh saffron threads', quantity: 1, unit: 'pinch' }, // no density: skipped
  ];
  const plan = planIngredients(ingredients);
  const lines = plan.lines.map((l) => ({
    grams: l.grams,
    per100g: l.lookup ? (pickBestFood(l.label, SEARCH[l.label])?.per100g ?? null) : null,
  }));
  const r = computeRecipeNutrition(lines, 4, ingredients.length);
  assert.equal(r.status, 'ready');
  if (r.status !== 'ready') return;
  assert.equal(r.usedIngredients, 5);
  assert.equal(r.totalIngredients, 6);
  // flour 910 + eggs 143 + milk 223 + butter 407 + sugar 97.6 = ~1781 kcal / 4 = ~445
  assert.ok(r.perServing.calories >= 435 && r.perServing.calories <= 455, String(r.perServing.calories));
  assert.ok(r.perServing.proteinG > 10 && r.perServing.proteinG < 14);
});
