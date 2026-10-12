import assert from 'node:assert/strict';
import type { RecipesTabRow } from '../config/recipesTabFilters';
import {
  PANTRY_CIRCLES_LIMIT,
  pantryCircleSticker,
  pickPantryCircleRows,
} from '../lib/recipesTab/pantryCircles';

function row(id: string, matched: number, missing: number, extra: Partial<{ pending: boolean }> = {}): RecipesTabRow {
  const total = matched + missing;
  return {
    kind: 'kitchen',
    recipe: { id, name: id } as never,
    match: {
      recipeId: id,
      recipeName: id,
      totalIngredients: total,
      matchedCount: matched,
      missingCount: missing,
      percentMatch: total ? Math.round((matched / total) * 100) : 0,
      matched: [],
      missing: [],
    },
    pantryMatchPending: extra.pending,
  };
}

const picks = pickPantryCircleRows([
  row('need2', 6, 2),
  row('ready-small', 2, 0),
  row('need1', 5, 1),
  row('ready-big', 8, 0),
  row('need3', 9, 3),
  row('nothing', 0, 4),
  row('pending', 3, 0, { pending: true }),
  row('ready-big', 8, 0),
]);
assert.deepEqual(
  picks.map((r) => r.recipe.id),
  ['ready-big', 'ready-small', 'need1', 'need2'],
  'ready first, then Need 1, Need 2; Need 3+, no-match, pending and duplicates left out',
);

const many = Array.from({ length: 20 }, (_, i) => row(`r${i}`, 3, 0));
assert.equal(pickPantryCircleRows(many).length, PANTRY_CIRCLES_LIMIT, 'row is capped');
assert.deepEqual(pickPantryCircleRows([]), [], 'empty pantry → no circles (category chips fall back)');

assert.deepEqual(pantryCircleSticker(0), { label: 'Ready', ready: true });
assert.deepEqual(pantryCircleSticker(1), { label: 'Need 1', ready: false });
assert.deepEqual(pantryCircleSticker(2), { label: 'Need 2', ready: false });

console.log('home-pantry-circles-check: ok');
