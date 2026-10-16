/// <reference types="node" />
// "Clear items" on the Pantry tab: which rows each choice covers, the menu counts, the words,
// and the list changes behind the optimistic clear and its Undo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLEAR_BATCH_SIZE,
  chunked,
  pantryRestoreColumns,
  removeMany,
  restoreMany,
} from '../src/data/pantryFields';
import { rollback } from '../src/data/listOps';
import type { PantryItem } from '../src/data/rows';
import { CLEAR_COPY, CLEAR_SCOPES, clearCounts, idsInScope, rowsInScope, scopeLabel } from '../src/pantry/clear/clearScope';

function row(id: string, location: string | null, extra: Partial<PantryItem> = {}): PantryItem {
  return {
    id,
    userId: 'u1',
    ingredientId: `ing-${id}`,
    name: `Item ${id}`,
    category: 'dry_goods',
    quantity: 2,
    unit: 'cup',
    location,
    photoUrl: null,
    expiresOn: null,
    updatedAt: '2026-10-16T00:00:00.000Z',
    scanPhotoPath: null,
    ...extra,
  };
}

const kitchen = [
  row('a', 'pantry'),
  row('b', 'fridge'),
  row('c', 'spice_rack'),
  row('d', ''), // empty counts as Pantry, as on the shelves
  row('e', null),
  row('f', 'Refrigerator'), // old free text counts as Fridge
  row('g', 'spice rack'),
  row('h', 'garage'), // unknown counts as Pantry
];

test('menu order is All items, then Pantry, Fridge, Spice rack', () => {
  assert.deepEqual(CLEAR_SCOPES, ['all', 'pantry', 'fridge', 'spice_rack']);
  assert.deepEqual(CLEAR_SCOPES.map(scopeLabel), ['All items', 'Pantry', 'Fridge', 'Spice rack']);
});

test('each place covers exactly the rows shown under it (old and empty values included)', () => {
  assert.deepEqual(idsInScope(kitchen, 'pantry'), ['a', 'd', 'e', 'h']);
  assert.deepEqual(idsInScope(kitchen, 'fridge'), ['b', 'f']);
  assert.deepEqual(idsInScope(kitchen, 'spice_rack'), ['c', 'g']);
  assert.deepEqual(idsInScope(kitchen, 'all'), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
});

test('the places split every row once: no row in two places, none left out', () => {
  const places = ['pantry', 'fridge', 'spice_rack'] as const;
  const all = places.flatMap((p) => idsInScope(kitchen, p)).sort();
  assert.deepEqual(all, idsInScope(kitchen, 'all').sort());
});

test('rowsInScope returns a copy and keeps the rows untouched', () => {
  const out = rowsInScope(kitchen, 'all');
  assert.notEqual(out, kitchen);
  assert.equal(out[0], kitchen[0]);
});

test('counts per choice match the rows, and an empty pantry is all zeros', () => {
  assert.deepEqual(clearCounts(kitchen), { all: 8, pantry: 4, fridge: 2, spice_rack: 2 });
  assert.deepEqual(clearCounts([]), { all: 0, pantry: 0, fridge: 0, spice_rack: 0 });
  assert.deepEqual(clearCounts([row('x', 'fridge')]), { all: 1, pantry: 0, fridge: 1, spice_rack: 0 });
});

test('menu labels carry the count for screen readers', () => {
  assert.equal(CLEAR_COPY.optionA11y('fridge', 12), 'Fridge, 12 items');
  assert.equal(CLEAR_COPY.optionA11y('spice_rack', 1), 'Spice rack, 1 item');
  assert.equal(CLEAR_COPY.optionA11y('all', 0), 'All items, no items');
  assert.equal(CLEAR_COPY.count(1), '1 item');
});

test('the confirm says exactly what goes', () => {
  assert.equal(CLEAR_COPY.confirmTitle('fridge', 12), 'Remove all 12 items from the Fridge?');
  assert.equal(CLEAR_COPY.confirmTitle('pantry', 1), 'Remove the 1 item in the Pantry?');
  assert.equal(CLEAR_COPY.confirmTitle('all', 30), 'Remove all 30 items?');
  assert.equal(CLEAR_COPY.confirmTitle('all', 1), 'Remove your 1 item?');
  assert.match(CLEAR_COPY.confirmBody('all'), /Pantry, the Fridge and the Spice rack/);
  assert.match(CLEAR_COPY.confirmBody('fridge'), /Other places are not touched/);
  assert.equal(CLEAR_COPY.confirmAction(12), 'Remove 12 items');
  assert.equal(CLEAR_COPY.removed('spice_rack', 3), 'Removed 3 items from the Spice rack.');
  assert.equal(CLEAR_COPY.removed('all', 1), 'Removed 1 item.');
  assert.equal(CLEAR_COPY.restored(3), '3 items are back.');
});

test('removeMany takes out only the given rows', () => {
  const change = removeMany<PantryItem>(['b', 'f']);
  assert.deepEqual(change.apply(kitchen).map((r) => r.id), ['a', 'c', 'd', 'e', 'g', 'h']);
});

test('a failed clear rolls back exactly when nothing else changed', () => {
  const change = removeMany<PantryItem>(['b', 'f']);
  const applied = change.apply(kitchen);
  assert.deepEqual(rollback(applied, kitchen, applied, change), kitchen);
});

test('a failed clear puts its rows back in place and keeps other changes made meanwhile', () => {
  const change = removeMany<PantryItem>(['a', 'b']);
  const applied = change.apply(kitchen);
  // Meanwhile: 'c' was deleted by another change, and a new row 'z' arrived.
  const current = [...applied.filter((r) => r.id !== 'c'), row('z', 'fridge')];
  const back = rollback(current, kitchen, applied, change);
  assert.deepEqual(back.map((r) => r.id), ['a', 'b', 'd', 'e', 'f', 'g', 'h', 'z']);
});

test('restoreMany adds the rows back once, even after a refetch already brought some', () => {
  const removed = [row('b', 'fridge'), row('f', 'Refrigerator')];
  const after = [row('a', 'pantry'), row('b', 'fridge')];
  const change = restoreMany<PantryItem>(removed);
  assert.deepEqual(change.apply(after).map((r) => r.id), ['a', 'b', 'f']);
  // A failed undo removes only what it added.
  const applied = change.apply(after);
  assert.deepEqual(change.revert(applied, after).map((r) => r.id), ['a', 'b']);
});

test('restore columns keep every field, including quantity, unit, date and place', () => {
  const item = row('q', 'Refrigerator', {
    quantity: 1.5,
    unit: 'lb',
    expiresOn: '2026-10-20',
    category: 'meats',
    photoUrl: 'https://example.com/p.jpg',
    scanPhotoPath: 'u1/scan.jpg',
  });
  const now = new Date('2026-10-16T12:00:00.000Z');
  assert.deepEqual(pantryRestoreColumns('u1', item, now), {
    id: 'q',
    user_id: 'u1',
    ingredient_id: 'ing-q',
    name: 'Item q',
    category: 'meats',
    quantity: 1.5,
    unit: 'lb',
    location: 'Refrigerator',
    photo_url: 'https://example.com/p.jpg',
    expires_on: '2026-10-20',
    scan_photo_path: 'u1/scan.jpg',
    updated_at: '2026-10-16T12:00:00.000Z',
  });
});

test('ids are sent in batches small enough for one address; a normal pantry is one request', () => {
  assert.equal(CLEAR_BATCH_SIZE, 100);
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  const batches = chunked(ids);
  assert.deepEqual(batches.map((b) => b.length), [100, 100, 50]);
  assert.deepEqual(batches.flat(), ids);
  assert.equal(chunked(ids.slice(0, 80)).length, 1);
  assert.deepEqual(chunked([]), []);
  assert.deepEqual(chunked([1, 2, 3], 0), [[1], [2], [3]]);
});
