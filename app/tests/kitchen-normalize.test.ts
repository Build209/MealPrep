/// <reference types="node" />
// Cases from the old app's mobile/scripts/ingredient-normalize-pantry-check.ts and
// simweek-smaller-bugs-check.ts (search label).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  areSameIngredientForPantryDedupe,
  canonicalIngredientPhrase,
  canonicalIngredientSearchLabel,
  ingredientMatchScore,
  normalizeIngredientName,
  tokenizeIngredientName,
} from '../src/kitchen/ingredientNormalize';

test('brands, plurals, accents and synonyms', () => {
  assert.equal(canonicalIngredientPhrase('WinCo Sliced Black Olives'), 'sliced black olive', 'strip WinCo and keep sliced black olives specificity');
  assert.equal(canonicalIngredientPhrase("Campbell's Cream of Mushroom Soup"), 'cream of mushroom soup', 'apostrophe brand strip without stray s');
  assert.ok(canonicalIngredientPhrase('Roma Tomatoes').endsWith('tomato'), 'tomatoes -> tomato not tomatoe');
  assert.ok(!canonicalIngredientPhrase('Roma Tomatoes').includes('tomatoe'), 'no tomatoe stem');
  assert.ok(canonicalIngredientPhrase('Yukon Potatoes').endsWith('potato'), 'potatoes -> potato');
  assert.ok(normalizeIngredientName('La Costeña Jalapeños').includes('jalape'), 'keep accented letters in normalized text');
  assert.equal(canonicalIngredientPhrase('Kraft Macaroni & Cheese'), 'macaroni and cheese', 'ampersand becomes and');
  assert.equal(canonicalIngredientPhrase("Libby's 100% Pure Pumpkin"), 'pumpkin puree', 'pure pumpkin maps to pumpkin puree');
  assert.equal(canonicalIngredientPhrase('Quaker Old Fashioned Oats'), 'oat', 'oats synonym collapses to oat token');
  assert.equal(canonicalIngredientPhrase('King Hawaiian Sweet Rolls'), 'roll', 'hawaiian rolls -> rolls');
  assert.equal(canonicalIngredientPhrase('Hungry Jack Pancake Syrup'), 'pancake syrup', 'pancake syrup must not double-apply syrup synonym');
  assert.equal(canonicalIngredientPhrase('Peach Halves'), 'peach half', 'peach halves -> peach half');
  assert.equal(canonicalIngredientPhrase('Chocolate Sandwich Cookies'), 'chocolate sandwich cookie', 'cookies -> cookie not cooky');
  assert.equal(canonicalIngredientPhrase('foie gras'), 'foie gras', 'foie gras must not lose trailing s');
  assert.equal(canonicalIngredientPhrase('Chili With Beans'), 'chili with beans', 'keep beans in chili with beans');
  assert.equal(canonicalIngredientPhrase('Instant Oatmeal'), 'instant oatmeal', 'instant oatmeal stays whole phrase');
});

test('pantry dedupe keeps different products apart', () => {
  assert.ok(!areSameIngredientForPantryDedupe('black olives', 'chopped olives'), 'black olives and chopped olives must not dedupe together');
  assert.ok(!areSameIngredientForPantryDedupe('diced tomatoes', 'marinara sauce'), 'diced tomatoes and marinara sauce must not dedupe together');
});

test('match scores', () => {
  assert.ok(ingredientMatchScore('diced tomatoes', 'tomato paste') < 0.72, 'diced tomatoes vs tomato paste');
  assert.ok(ingredientMatchScore('diced tomatoes', 'tomato soup') < 0.72, 'diced tomatoes vs tomato soup');
  assert.ok(ingredientMatchScore('diced tomatoes', 'ketchup') < 0.72, 'diced tomatoes vs ketchup');
  assert.ok(ingredientMatchScore('1 large yellow onion, diced', 'Onion') >= 0.72, 'yellow onion diced matches onion');
  assert.ok(ingredientMatchScore('2 tablespoons unsalted butter, softened', 'Butter') >= 0.72, 'descriptive butter matches butter');
  assert.ok(ingredientMatchScore('butter', 'peanut butter') < 0.72, 'butter vs peanut butter');
});

test('tokens and search labels', () => {
  const tokens = tokenizeIngredientName('Essential Everyday All Purpose Flour 5 lb');
  assert.ok(tokens.join(' ').includes('all-purpose'), 'all purpose flour phrase');
  assert.equal(canonicalIngredientSearchLabel('chocolate sandwich cookies'), 'chocolate sandwich cookie');
  assert.equal(canonicalIngredientSearchLabel('foie gras'), 'foie gras');
});
