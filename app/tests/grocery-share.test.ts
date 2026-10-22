/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GroceryItem } from '../src/data/groceryRows';
import { groceryListText, groceryView } from '../src/grocery/groceryLogic';

function row(over: Partial<GroceryItem>): GroceryItem {
  return {
    id: 'i', userId: 'u', ingredientId: 'x', name: 'Milk', category: 'dairy', quantity: 1, unit: 'each',
    checked: false, sourceRecipeIds: [], updatedAt: '2026-10-21', origin: 'manual', plannedMealLinks: [], ...over,
  };
}

test('list text: open items only, grouped by aisle, quantity on each line', () => {
  const text = groceryListText(groceryView([
    row({ id: '1', name: 'Milk', category: 'dairy', quantity: 2, unit: 'l' }),
    row({ id: '2', name: 'Onions', category: 'produce', quantity: 3, unit: 'each' }),
    row({ id: '3', name: 'Eggs', category: 'dairy', checked: true }),
  ]));
  assert.ok(text.includes('Milk (2 l)'));
  assert.ok(text.includes('Onions'));
  assert.ok(!text.includes('Eggs'), 'ticked rows are left out');
  assert.ok(text.indexOf('Onions') < text.indexOf('Milk'), 'produce comes before dairy');
  assert.ok(text.split('\n').filter((l) => l.startsWith('- ')).length === 2);
});

test('list text: empty or all-ticked list gives empty text', () => {
  assert.equal(groceryListText(groceryView([])), '');
  assert.equal(groceryListText(groceryView([row({ checked: true })])), '');
});
