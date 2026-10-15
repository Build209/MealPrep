/// <reference types="node" />
// Cases from the old app's mobile/scripts/format-quantity-check.ts and qa-bugfix-regression.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIngredientAmount,
  formatIngredientText,
  formatQuantity,
  formatQuantityWithUnit,
} from '../src/kitchen/formatQuantity';

test('formatQuantity snaps to kitchen fractions', () => {
  assert.equal(formatQuantity(0.5), '½');
  assert.equal(formatQuantity(0.33), '⅓');
  assert.equal(formatQuantity(0.67), '⅔');
  assert.equal(formatQuantity(1.5), '1½');
  assert.equal(formatQuantity(2.25), '2¼');
  assert.equal(formatQuantity(0.125), '⅛');
  assert.equal(formatQuantity(0.167), '⅛');
  assert.equal(formatQuantity(1 / 6), '⅛');
  assert.equal(formatQuantity(0.2), '¼');
  assert.equal(formatQuantity(3), '3');
  assert.equal(formatQuantity(2.98), '3');
  assert.equal(formatQuantity(1.333), '1⅓');
});

test('formatQuantityWithUnit keeps metric whole and imperial fractional', () => {
  assert.equal(formatQuantityWithUnit(250, 'g'), '250 g');
  assert.equal(formatQuantityWithUnit(12.5, 'oz'), '12½ oz');
  assert.equal(formatQuantityWithUnit(0.5, 'oz'), '½ oz');
  assert.equal(formatQuantityWithUnit(1.5, 'lb'), '1½ lb');
  assert.equal(formatQuantityWithUnit(0.25, 'fl oz'), '¼ fl oz');
});

test('formatIngredientText rewrites decimals but not prices, versions or temperatures', () => {
  assert.equal(formatIngredientText('0.75 cup flour'), '¾ cup flour');
  assert.equal(formatIngredientText('no decimals here'), 'no decimals here');
  assert.equal(formatIngredientText('$3.49 each'), '$3.49 each');
  assert.equal(formatIngredientText('v1.2'), 'v1.2');
  assert.equal(formatIngredientText('Bake at 350.5 degrees for 20 min'), 'Bake at 350.5 degrees for 20 min');
  assert.equal(formatIngredientText('Bake at 350.5 °F'), 'Bake at 350.5 °F');
  assert.equal(formatIngredientText('1.5-inch thick steak'), '1½-inch thick steak');
  assert.equal(formatIngredientText('12.5 oz can'), '12½ oz can');
});

test('formatIngredientAmount', () => {
  assert.equal(formatIngredientAmount(0.5, 'cup', 'flour'), '½ cup flour');
  assert.equal(formatIngredientAmount(0, '', '0.5 cup sugar'), '½ cup sugar');
});
