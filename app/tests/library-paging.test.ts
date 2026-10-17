/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY_PAGE_SIZE, readAllPages } from '../src/data/libraryPaging';
import { rankRecipeFeed } from '../src/kitchen/recipeFeed';

test('readAllPages joins pages until a short page and asks for the right ranges', async () => {
  const total = 2500;
  const asked: [number, number][] = [];
  const rows = await readAllPages<number>(async (from, to) => {
    asked.push([from, to]);
    return Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i);
  });
  assert.equal(rows.length, total);
  assert.deepEqual(asked, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(LIBRARY_PAGE_SIZE, 1000);
});

test('readAllPages stops after one page when the library is small', async () => {
  let calls = 0;
  const rows = await readAllPages<number>(async () => {
    calls += 1;
    return [1, 2, 3];
  });
  assert.deepEqual(rows, [1, 2, 3]);
  assert.equal(calls, 1);
});

test('minIngredientLines keeps one-line recipes out of More recipes', () => {
  const ing = (name: string) => ({ ingredientId: name, name, quantity: 1, unit: 'each' });
  const recipes = [
    { id: 'thin', name: 'Thin', ingredients: [ing('water')] },
    { id: 'full', name: 'Full', ingredients: [ing('a'), ing('b'), ing('c'), ing('d')] },
  ];
  assert.equal(rankRecipeFeed(recipes, []).more.length, 2);
  assert.deepEqual(rankRecipeFeed(recipes, [], { minIngredientLines: 3 }).more.map((e) => e.recipe.id), ['full']);
});
