/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY_PAGE_SIZE, readAllPages } from '../src/data/libraryPaging';
import { hideThinLibraryRecipe, rankRecipeFeed } from '../src/kitchen/recipeFeed';

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

test('thin library recipes are kept out of More recipes; thin master and own recipes stay', () => {
  const ing = (name: string) => ({ ingredientId: name, name, quantity: 1, unit: 'each' });
  const recipes = [
    { id: 'l_thin', name: 'Thin library', ingredients: [ing('water')] },
    { id: 'r_thin', name: 'Own thin', ingredients: [ing('rice')] },
    { id: 'l_full', name: 'Full library', ingredients: [ing('a'), ing('b'), ing('c')] },
  ];
  assert.equal(rankRecipeFeed(recipes, []).more.length, 3);
  const ids = rankRecipeFeed(recipes, [], { hideFromMore: hideThinLibraryRecipe }).more.map((e) => e.recipe.id).sort();
  assert.deepEqual(ids, ['l_full', 'r_thin']);
});
