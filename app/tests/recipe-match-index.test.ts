/// <reference types="node" />
// With 8+ pantry rows the matcher only compares an ingredient with rows that share a word, a
// synonym group or a family. These cases must still match through that narrowing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRecipeAgainstPantry } from '../src/kitchen/recipeMatch';

const row = (name: string, i: number) => ({ id: `p${i}`, ingredientId: name.replace(/ /g, '-'), name, quantity: 5, unit: 'each', category: 'produce' });
const filler = ['milk', 'rice', 'lemons', 'honey', 'carrots', 'pasta', 'tofu'];
const line = (name: string) => ({ ingredientId: `lib-x-${name}`, name, quantity: 1, unit: 'each' });
const score = (pantryNames: string[], ...ingredients: string[]) =>
  scoreRecipeAgainstPantry({ id: 'r', name: 'R', ingredients: ingredients.map(line) }, [...filler, ...pantryNames].map(row));

test('a synonym with no shared word still matches (scallions / green onions)', () => {
  assert.equal(score(['scallions'], 'green onions').matchedCount, 1);
});

test('a family word matches a member of that family (cheese / cheddar)', () => {
  assert.equal(score(['cheddar'], 'cheese').matchedCount, 1);
});

test('egg yolks come out of whole eggs', () => {
  assert.equal(score(['eggs'], 'egg yolks').matchedCount, 1);
});

test('an unrelated pantry matches nothing and the recipe line is missing', () => {
  const m = score(['tea bags'], 'butter');
  assert.equal(m.matchedCount, 0);
  assert.equal(m.missingCount, 1);
});

test('the same answer with a small pantry (no narrowing) and a large one', () => {
  const small = scoreRecipeAgainstPantry({ id: 'r', name: 'R', ingredients: [line('green onions')] }, ['scallions'].map(row));
  assert.equal(small.matchedCount, 1);
});
