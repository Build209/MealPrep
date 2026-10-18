/// <reference types="node" />
// Gear matching: swaps, untagged recipes, skipped picker, soft sort and the "only what I can make" filter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPicks, gearFromRows, gearStatus, groupByCategory, sortByGear, swapsFromRows } from '../src/utensils/gear';

const swaps = swapsFromRows([
  { needs: 'oven', can_use: 'air_fryer', quality: 'good', note: 'x' },
  { needs: 'oven', can_use: 'toaster_oven', quality: 'ok', note: null },
  { needs: 'pressure_cooker', can_use: 'slow_cooker', quality: 'poor', note: null },
  { needs: 'blender', can_use: 'food_processor', quality: 'bogus' },
]);
const own = (...s: string[]) => new Set(s);

test('rows: bad rows dropped, gear sorted, swaps keep only known qualities', () => {
  const items = gearFromRows([
    { slug: 'b', name: 'B', category: 'tools', sort_order: 2 },
    { slug: 'a', name: 'A', category: 'heat', sort_order: 1 },
    { slug: 'c', name: 'C', category: 'nope', sort_order: 3 },
    { slug: 5, name: 'D', category: 'heat' },
  ]);
  assert.deepEqual(items.map((i) => i.slug), ['a', 'b']);
  assert.equal(swaps.length, 3);
  assert.deepEqual(groupByCategory(items).map((g) => g.category), ['heat', 'tools']);
});

test('cleanPicks keeps known gear once', () => {
  const items = gearFromRows([{ slug: 'oven', name: 'Oven', category: 'heat' }]);
  assert.deepEqual(cleanPicks(['oven', 'oven', 'ghost'], items), ['oven']);
});

test('skipped picker: nothing is ever unknown-to-needs', () => {
  assert.deepEqual(gearStatus({ equipmentRequired: ['oven'], equipmentTaggedAt: 'x' }, null, swaps), { kind: 'unknown' });
});

test('untagged is unknown, tagged with nothing needed is ready', () => {
  assert.deepEqual(gearStatus({ equipmentRequired: [] }, own('oven'), swaps), { kind: 'unknown' });
  assert.deepEqual(gearStatus({ equipmentRequired: [], equipmentTaggedAt: '2026-10-18' }, own(), swaps), { kind: 'ready' });
});

test('owned gear is ready; a good swap works; no oven and no swap needs the oven', () => {
  const r = { equipmentRequired: ['oven'], equipmentTaggedAt: 'x' };
  assert.deepEqual(gearStatus(r, own('oven'), swaps), { kind: 'ready' });
  assert.deepEqual(gearStatus(r, own('air_fryer'), swaps), { kind: 'works', via: [{ needs: 'oven', canUse: 'air_fryer' }] });
  assert.deepEqual(gearStatus(r, own('microwave'), swaps), { kind: 'needs', missing: ['oven'] });
});

test('a poor swap is not promised', () => {
  const r = { equipmentRequired: ['pressure_cooker'], equipmentTaggedAt: 'x' };
  assert.deepEqual(gearStatus(r, own('slow_cooker'), swaps), { kind: 'needs', missing: ['pressure_cooker'] });
});

test('the better swap wins', () => {
  const r = { equipmentRequired: ['oven'], equipmentTaggedAt: 'x' };
  const s = gearStatus(r, own('toaster_oven', 'air_fryer'), swaps);
  assert.deepEqual(s, { kind: 'works', via: [{ needs: 'oven', canUse: 'air_fryer' }] });
});

test('soft sort is stable and moves only the recipes that lack gear', () => {
  const list = [
    { id: 'roast', equipmentRequired: ['oven'], equipmentTaggedAt: 'x' },
    { id: 'salad', equipmentRequired: [] as string[] },
    { id: 'stew', equipmentRequired: ['stockpot'], equipmentTaggedAt: 'x' },
    { id: 'toast', equipmentRequired: ['toaster_oven'], equipmentTaggedAt: 'x' },
  ];
  const sorted = sortByGear(list, own('air_fryer', 'stockpot'), swaps);
  assert.deepEqual(sorted.map((r) => r.id), ['roast', 'salad', 'stew', 'toast']);
  const sorted2 = sortByGear(list, own('air_fryer'), swaps);
  assert.deepEqual(sorted2.map((r) => r.id), ['roast', 'salad', 'stew', 'toast'].filter((x) => x !== 'stew' && x !== 'toast').concat(['stew', 'toast']));
  assert.deepEqual(sortByGear(list, own('air_fryer'), swaps, { onlyMakeable: true }).map((r) => r.id), ['roast', 'salad']);
});

test('skipped picker returns the same order, even with the toggle', () => {
  const list = [{ id: 'a', equipmentRequired: ['oven'], equipmentTaggedAt: 'x' }, { id: 'b' }];
  assert.deepEqual(sortByGear(list, null, swaps, { onlyMakeable: true }).map((r) => r.id), ['a', 'b']);
});
