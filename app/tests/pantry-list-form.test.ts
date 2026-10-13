/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataError } from '../src/data/errors';
import {
  cleanPantryFields,
  pantryFieldsToColumns,
  placeholderPantryItem,
  restoreItem,
  validatePantryFields,
} from '../src/data/pantryFields';
import type { PantryItem } from '../src/data/rows';
import {
  changedPantryFields,
  emptyPantryForm,
  manualIngredientId,
  pantryFormFromItem,
  parseQuantity,
  quantityText,
  quickDate,
  readPantryForm,
  suggestPlaceForName,
} from '../src/pantry/form/itemForm';
import { groupPantryForList, pantryRowDetail, pantryRowLabel } from '../src/pantry/list/grouping';
import { toShelvedItem } from '../src/pantry/types';
import { readPantryViewMode, writePantryViewMode } from '../src/pantry/viewMode';

const NOW = new Date(2026, 9, 10, 12, 0, 0);

function row(id: string, name: string, extra: Partial<PantryItem> = {}): PantryItem {
  return {
    id,
    userId: 'u1',
    ingredientId: `i-${id}`,
    name,
    category: 'dry_goods',
    quantity: 1,
    unit: 'each',
    location: 'pantry',
    photoUrl: null,
    expiresOn: null,
    updatedAt: '2026-10-10T00:00:00Z',
    scanPhotoPath: null,
    ...extra,
  };
}

// ------------------------------------------------------------------ list view

test('rows read through toShelvedItem: old or empty places count as the pantry', () => {
  assert.equal(toShelvedItem(row('a', 'Rice', { location: '' })).location, 'pantry');
  assert.equal(toShelvedItem(row('a', 'Rice', { location: null })).location, 'pantry');
  assert.equal(toShelvedItem(row('a', 'Milk', { location: 'Refrigerator' })).location, 'fridge');
  assert.equal(toShelvedItem(row('a', 'Rice', { category: 'Grains' })).category, 'dry_goods');
});

test('list groups: Use soon first, then Fridge, Pantry, Spice rack; each item once', () => {
  const items = [
    row('1', 'Rice'),
    row('2', 'Milk', { location: 'fridge', category: 'dairy', expiresOn: '2026-10-12' }),
    row('3', 'Bread', { expiresOn: '2026-10-08' }),
    row('4', 'Cumin', { location: 'spice_rack', category: 'spices' }),
    row('5', 'Cheese', { location: 'fridge', category: 'dairy', expiresOn: '2026-11-30' }),
    row('6', 'Apples', { location: 'fridge', category: 'produce' }),
  ].map(toShelvedItem);
  const groups = groupPantryForList(items, NOW);
  assert.deepEqual(
    groups.map((g) => [g.title, g.items.map((i) => i.name)]),
    [
      ['Use soon', ['Bread', 'Milk']],
      ['Fridge', ['Apples', 'Cheese']],
      ['Pantry', ['Rice']],
      ['Spice rack', ['Cumin']],
    ],
  );
  const listed = groups.flatMap((g) => g.items.map((i) => i.id)).sort();
  assert.deepEqual(listed, ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(groupPantryForList([], NOW), []);
});

test('row detail and accessible name', () => {
  const rice = toShelvedItem(row('1', 'Rice', { quantity: 2, unit: 'cup' }));
  assert.equal(pantryRowDetail(rice, NOW), '2 cup');
  assert.equal(pantryRowDetail({ quantity: 1.5, unit: 'lb', expiresOn: '2026-10-13' }, NOW), '1½ lb · 3 days left');
  assert.equal(pantryRowDetail({ quantity: 1, unit: 'each', expiresOn: '2026-10-10' }, NOW), '1 each · Use today');
  assert.equal(pantryRowDetail({ quantity: 1, unit: 'each', expiresOn: '2026-10-01' }, NOW), '1 each · Past its date');
  assert.equal(pantryRowDetail({ quantity: 1, unit: 'each', expiresOn: '2026-12-01' }, NOW), '1 each');
  assert.equal(pantryRowLabel(rice, NOW), 'Rice, 2 cup, Pantry');
});

// ----------------------------------------------------------------------- form

test('parseQuantity', () => {
  assert.equal(parseQuantity('2'), 2);
  assert.equal(parseQuantity(' 1.5 '), 1.5);
  assert.equal(parseQuantity('1,5'), 1.5);
  assert.equal(parseQuantity('.5'), 0.5);
  assert.equal(parseQuantity('1/2'), 0.5);
  assert.equal(parseQuantity('1 1/2'), 1.5);
  assert.equal(parseQuantity('0'), 0);
  assert.equal(parseQuantity(''), null);
  assert.equal(parseQuantity('-1'), null);
  assert.equal(parseQuantity('two'), null);
  assert.equal(parseQuantity('1/0'), null);
  assert.equal(quantityText(2), '2');
  assert.equal(quantityText(1 / 3), '0.33');
});

test('readPantryForm: checks, defaults and the guessed category', () => {
  const bad = readPantryForm({ ...emptyPantryForm(), name: '  ', quantity: 'lots', expiresOn: '2026-13-01' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['expiresOn', 'name', 'quantity']);

  const good = readPantryForm({ name: ' Whole milk ', quantity: '2', unit: '  ', location: 'fridge', expiresOn: '' });
  assert.deepEqual(good, {
    ok: true,
    fields: { name: 'Whole milk', category: 'dairy', quantity: 2, unit: 'each', location: 'fridge', expiresOn: null },
  });

  // An edit keeps the saved category unless the name changes.
  const kept = readPantryForm({ name: 'whole milk', quantity: '1', unit: 'jug', location: 'fridge', expiresOn: '2026-10-20' }, { name: 'Whole milk', category: 'condiments' });
  assert.ok(kept.ok && kept.fields.category === 'condiments' && kept.fields.expiresOn === '2026-10-20');
  const renamed = readPantryForm({ name: 'Cumin', quantity: '1', unit: 'jar', location: 'spice_rack', expiresOn: '' }, { name: 'Whole milk', category: 'dairy' });
  assert.ok(renamed.ok && renamed.fields.category === 'spices');
});

test('form from an item, changed fields only, place suggestion, ids and dates', () => {
  const milk = toShelvedItem(row('1', 'Milk', { location: 'fridge', category: 'dairy', quantity: 1, unit: 'jug', expiresOn: '2026-10-20' }));
  const values = pantryFormFromItem(milk);
  assert.deepEqual(values, { name: 'Milk', quantity: '1', unit: 'jug', location: 'fridge', expiresOn: '2026-10-20' });
  const read = readPantryForm({ ...values, quantity: '3' }, milk);
  assert.ok(read.ok);
  if (read.ok) assert.deepEqual(changedPantryFields(milk, read.fields), { quantity: 3 });

  assert.equal(suggestPlaceForName('Whole milk'), 'fridge');
  assert.equal(suggestPlaceForName('Smoked paprika'), 'spice_rack');
  assert.equal(suggestPlaceForName('Rice'), 'pantry');
  assert.equal(suggestPlaceForName(''), 'pantry');
  assert.equal(manualIngredientId(' Brown Rice ', 1700000000000), 'manual-brown-rice-1700000000000');
  assert.equal(quickDate(3, NOW), '2026-10-13');
  assert.equal(quickDate(7, NOW), '2026-10-17');
});

// ---------------------------------------------------------- data layer fields

test('validatePantryFields refuses bad input with plain words', () => {
  assert.throws(() => validatePantryFields({ name: ' ' }), (e: unknown) => e instanceof DataError && e.kind === 'invalid');
  assert.throws(() => validatePantryFields({ quantity: -1 }), DataError);
  assert.throws(() => validatePantryFields({ quantity: Number.NaN }), DataError);
  assert.throws(() => validatePantryFields({ expiresOn: 'tomorrow' }), DataError);
  assert.doesNotThrow(() => validatePantryFields({ expiresOn: null, quantity: 0, name: 'Rice' }));
  assert.doesNotThrow(() => validatePantryFields({}));
});

test('columns, cleaning and the placeholder row', () => {
  assert.deepEqual(pantryFieldsToColumns({ name: ' Rice ', unit: ' ', expiresOn: null, location: 'pantry' }), {
    name: 'Rice',
    unit: 'each',
    expires_on: null,
    location: 'pantry',
  });
  assert.deepEqual(pantryFieldsToColumns({ quantity: 3 }), { quantity: 3 });
  assert.deepEqual(cleanPantryFields({ quantity: 2 }), { quantity: 2 }, 'fields not given stay out');

  const placeholder = placeholderPantryItem(
    'u1',
    { name: ' Oats ', category: 'dry_goods', quantity: 2, unit: 'cup', location: 'pantry', expiresOn: null, ingredientId: 'manual-oats-1', tempId: 'temp-x' },
    NOW,
  );
  assert.equal(placeholder.id, 'temp-x');
  assert.equal(placeholder.name, 'Oats');
  assert.equal(placeholder.userId, 'u1');
  assert.equal(placeholder.updatedAt, NOW.toISOString());
});

test('restoreItem puts the same row back once, and reverting removes it', () => {
  const a = row('a', 'A');
  const b = row('b', 'B');
  const change = restoreItem(b);
  assert.deepEqual(change.apply([a]).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(change.apply([a, b]).map((r) => r.id), ['a', 'b'], 'already back (a refetch got there first)');
  assert.deepEqual(change.revert([a, b], [a]).map((r) => r.id), ['a']);
  assert.deepEqual(change.revert([a, b], [a, b]).map((r) => r.id), ['a', 'b'], 'it was there before: leave it');
});

// ------------------------------------------------------------------- view mode

test('view mode is remembered and never throws', () => {
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  assert.equal(readPantryViewMode(store), 'shelves', 'shelves by default (owner-approved mockup)');
  writePantryViewMode('list', store);
  assert.equal(readPantryViewMode(store), 'list');
  data.set('mealprep.pantryViewMode', '{bad json');
  assert.equal(readPantryViewMode(store), 'shelves');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(readPantryViewMode(broken), 'shelves');
  assert.doesNotThrow(() => writePantryViewMode('list', broken));
  assert.equal(readPantryViewMode(null), 'shelves');
});

