/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gramsForIngredient } from '../src/nutrition/toGrams';

const near = (a: number | null, b: number, tol = 0.5) => assert.ok(a !== null && Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('mass units convert exactly', () => {
  near(gramsForIngredient('chicken breast', 1, 'lb'), 453.592);
  near(gramsForIngredient('cheddar', 8, 'oz'), 226.8, 0.1);
  near(gramsForIngredient('anything', 250, 'g'), 250);
  near(gramsForIngredient('anything', 0.5, 'kg'), 500);
});

test('volume units use a density, skipped when unknown', () => {
  near(gramsForIngredient('all-purpose flour', 1, 'cup'), 125, 1);
  near(gramsForIngredient('olive oil', 2, 'tbsp'), 27.2, 0.5);
  near(gramsForIngredient('whole milk', 1, 'cups'), 243.7, 1);
  near(gramsForIngredient('peanut butter', 1, 'tbsp'), 16, 0.5);
  assert.equal(gramsForIngredient('dragon fruit puree', 1, 'cup'), null);
});

test('specific density phrase wins over the general word', () => {
  near(gramsForIngredient('brown sugar', 1, 'cup'), 220, 1);
  near(gramsForIngredient('sugar', 1, 'cup'), 201, 1);
});

test('counts use typical piece weights, skipped when unknown', () => {
  near(gramsForIngredient('large eggs', 2, ''), 100);
  near(gramsForIngredient('eggs', 2, 'large'), 100);
  near(gramsForIngredient('yellow onion', 1, 'each'), 110);
  near(gramsForIngredient('eggs', 1, 'dozen'), 600);
  near(gramsForIngredient('cloves garlic', 4, 'cloves'), 12);
  assert.equal(gramsForIngredient('dragon fruit', 2, 'each'), null);
  assert.equal(gramsForIngredient('ginger', 2, 'cloves'), null);
});

test('word boundaries: eggplant is not egg, butternut is not butter', () => {
  assert.equal(gramsForIngredient('eggplant', 1, 'each'), null);
  assert.equal(gramsForIngredient('butternut squash', 1, 'cup'), null);
});

test('bad quantities and units are skipped', () => {
  assert.equal(gramsForIngredient('flour', null, 'cup'), null);
  assert.equal(gramsForIngredient('flour', undefined, 'cup'), null);
  assert.equal(gramsForIngredient('flour', 0, 'cup'), null);
  assert.equal(gramsForIngredient('flour', -1, 'cup'), null);
  assert.equal(gramsForIngredient('flour', Number.NaN, 'cup'), null);
  assert.equal(gramsForIngredient('flour', 1, 'can'), null);
  assert.equal(gramsForIngredient('flour', 1, 'bunch'), null);
  assert.equal(gramsForIngredient('flour', 1, null), null);
});
