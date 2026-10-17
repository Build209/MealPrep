import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NUTRITION_COPY } from '../src/nutrition-ui/copy';
import { formatCalories, formatGrams, ingredientCounts } from '../src/nutrition-ui/format';

test('calories round to the nearest 5', () => {
  assert.equal(formatCalories(212), '210');
  assert.equal(formatCalories(213), '215');
  assert.equal(formatCalories(2.4), '0');
  assert.equal(formatCalories(2.5), '5');
  assert.equal(formatCalories(0), '0');
  assert.equal(formatCalories(1234), '1235');
});

test('calories never show negative or broken numbers', () => {
  assert.equal(formatCalories(-40), '0');
  assert.equal(formatCalories(Number.NaN), '0');
  assert.equal(formatCalories(Number.POSITIVE_INFINITY), '0');
});

test('grams are whole numbers with a unit', () => {
  assert.equal(formatGrams(12.4), '12 g');
  assert.equal(formatGrams(12.5), '13 g');
  assert.equal(formatGrams(0.2), '0 g');
  assert.equal(formatGrams(-3), '0 g');
  assert.equal(formatGrams(Number.NaN), '0 g');
});

test('ingredient counts are whole and used never exceeds total', () => {
  assert.deepEqual(ingredientCounts(5, 8), { used: 5, total: 8 });
  assert.deepEqual(ingredientCounts(9, 8), { used: 8, total: 8 });
  assert.deepEqual(ingredientCounts(2.7, 8.9), { used: 2, total: 8 });
  assert.deepEqual(ingredientCounts(-1, Number.NaN), { used: 0, total: 0 });
});

test('copy: the exact lines, and no health, diet or savings words', () => {
  assert.equal(NUTRITION_COPY.title, 'Nutrition per serving');
  assert.equal(NUTRITION_COPY.estimate(5, 8), 'Estimate based on 5 of 8 ingredients');
  assert.equal(NUTRITION_COPY.source, 'Source: USDA FoodData Central');
  assert.equal(NUTRITION_COPY.checkLabel, 'Estimate only. Check the label and verify before you cook.');
  assert.equal(NUTRITION_COPY.notEnoughData, 'Not enough data for this recipe');
  const all = JSON.stringify([
    ...Object.values(NUTRITION_COPY).filter((v) => typeof v === 'string'),
    NUTRITION_COPY.estimate(1, 2),
    NUTRITION_COPY.readyLabel('1', '2', '3', '4'),
  ]);
  assert.doesNotMatch(all, /healthy|health|diet|lose weight|weight loss|sav(e|ing)|cheap|doctor|medical/i);
});
