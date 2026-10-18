/// <reference types="node" />
// Gear in the Recipes feed: demoting recipes that lack gear, the note under a card, and the tags on library rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoteLacking, swapsFromRows } from '../src/utensils/gear';
import { gearNote } from '../src/utensils/gearNote';
import { libraryRecipeFromRow, LIBRARY_LIST_COLUMNS } from '../src/data/recipeRows';

const swaps = swapsFromRows([{ needs: 'oven', can_use: 'air_fryer', quality: 'good', note: null }]);
const own = (...s: string[]) => new Set(s);

test('demoteLacking: entries keep their order inside each group; skipped picker changes nothing', () => {
  const items = [
    { recipe: { equipmentRequired: ['wok'], equipmentTaggedAt: 'x' }, id: 1 },
    { recipe: { equipmentRequired: [] as string[] }, id: 2 },
    { recipe: { equipmentRequired: ['oven'], equipmentTaggedAt: 'x' }, id: 3 },
  ];
  assert.deepEqual(demoteLacking(items, (e) => e.recipe, own('oven'), swaps).map((e) => e.id), [2, 3, 1]);
  assert.deepEqual(demoteLacking(items, (e) => e.recipe, null, swaps).map((e) => e.id), [1, 2, 3]);
});

test('gearNote: only swaps and missing gear get a line, and a swap says "could"', () => {
  const name = (s: string) => ({ air_fryer: 'Air fryer', oven: 'Oven', wok: 'Wok' } as Record<string, string>)[s] ?? s;
  assert.equal(gearNote({ kind: 'unknown' }, name), null);
  assert.equal(gearNote({ kind: 'ready' }, name), null);
  assert.equal(gearNote({ kind: 'works', via: [{ needs: 'oven', canUse: 'air_fryer' }] }, name), 'Could work with your air fryer');
  assert.equal(gearNote({ kind: 'needs', missing: ['wok', 'oven'] }, name), 'Needs: Wok, Oven');
});

test('library rows carry gear tags into the app recipe; the list query asks for them', () => {
  const base = { id: 'a', slug: 's', title: 'T', dish_name: 'D', servings: 2, prep_minutes: 5, cook_minutes: 5, ingredients: [], steps: [], image_url: null, created_at: '2026-10-18' };
  const tagged = libraryRecipeFromRow({ ...base, equipment_required: ['oven'], equipment_tagged_at: '2026-10-18T00:00:00Z' });
  assert.deepEqual(tagged.equipmentRequired, ['oven']);
  assert.equal(tagged.equipmentTaggedAt, '2026-10-18T00:00:00Z');
  const plain = libraryRecipeFromRow(base);
  assert.deepEqual(plain.equipmentRequired, []);
  assert.equal(plain.equipmentTaggedAt, null);
  assert.ok(LIBRARY_LIST_COLUMNS.includes('equipment_required') && LIBRARY_LIST_COLUMNS.includes('equipment_tagged_at'));
});
