/// <reference types="node" />
// Cases from the old app's mobile/scripts/pantry-shelf-view-check.ts (the pure part; the old
// check's "screen wiring" asserts read the old screen's source and do not apply here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PantryCategory } from '../src/kitchen/categories';
import type { PantryStorageLocation } from '../src/kitchen/storage';
import {
  isFreshProduce,
  isPantryViewMode,
  PACKAGE_LABEL_BOX,
  PACKAGE_LABEL_COLORS,
  PACKAGE_SHAPES,
  packageLabelColor,
  packageShapeFor,
  packageShapeFromUnit,
  SHELF_MAX_TILES,
  SHELF_PLACES,
  SHELF_VIEW_COPY,
  shelfAmount,
  shelfDaysBadge,
} from '../src/pantry/shelves/packages';
import { buildPantryShelves, pantryShelfSummary, resolveShelfPlace } from '../src/pantry/shelves/shelfView';
import type { ShelvedItem } from '../src/pantry/types';

const NOW = new Date(2026, 9, 10, 12, 0, 0);
let seq = 0;
function item(
  name: string,
  category: PantryCategory,
  location: PantryStorageLocation,
  extra: Partial<ShelvedItem> = {},
): ShelvedItem {
  seq += 1;
  return {
    id: `p${seq}`,
    userId: 'u1',
    ingredientId: `i${seq}`,
    name,
    category,
    quantity: 1,
    unit: 'each',
    location,
    photoUrl: null,
    expiresOn: null,
    updatedAt: '2026-10-10T00:00:00Z',
    scanPhotoPath: null,
    ...extra,
  };
}

const shape = (name: string, category: PantryCategory, location: PantryStorageLocation = 'pantry', unit = 'each') =>
  packageShapeFor({ name, category, location, unit });

test('package shapes', () => {
  assert.equal(shape('Paprika', 'spices', 'spice_rack'), 'shaker');
  assert.equal(shape('Salt', 'dry_goods', 'spice_rack'), 'shaker', 'anything kept on the spice rack is a shaker');
  assert.equal(shape('Tomato sauce', 'dry_goods'), 'can', 'a canned sauce is a can, not a bottle');
  assert.equal(shape('Coconut milk', 'dry_goods'), 'can', 'checked before plain milk');
  assert.equal(shape('Whole milk', 'dairy', 'fridge'), 'jug');
  assert.equal(shape('Orange juice', 'condiments', 'fridge'), 'carton');
  assert.equal(shape('Peanut butter', 'condiments'), 'jar', 'checked before butter');
  assert.equal(shape('Butter', 'dairy', 'fridge'), 'box');
  assert.equal(shape('Soy sauce', 'condiments', 'fridge'), 'bottle');
  assert.equal(shape('Olive oil', 'condiments'), 'bottle');
  assert.equal(shape('Greek yogurt', 'dairy', 'fridge'), 'tub');
  assert.equal(shape('Spaghetti', 'dry_goods'), 'box');
  assert.equal(shape('Jasmine rice', 'dry_goods'), 'bag');
  assert.equal(shape('Apples', 'produce', 'fridge'), 'crate');
  assert.equal(shape('Spinach', 'produce', 'fridge'), 'crate');
  // Owner, 2026-10-10: produce is never drawn in a bottle or a jar.
  for (const [name, unit] of [['Grape', 'bag'], ['Onions', 'each'], ['Garlic', 'head'], ['Carrots', 'lb'], ['Lemon juice lemons', 'each']] as const) {
    assert.equal(shape(name, 'produce', 'fridge', unit), 'crate', `${name} [${unit}] is fresh produce in a crate`);
  }
  assert.equal(shape('Pepperoncini', 'produce', 'fridge', 'jar'), 'jar', 'jarred peppers are not fresh produce');
  assert.equal(shape('Ginger Paste', 'produce', 'fridge', 'tube'), 'bottle');
  assert.equal(shape('Heavy Whipping Cream', 'dairy', 'fridge', 'carton'), 'carton');
  assert.equal(shape('Pork Tenderloin', 'meats', 'fridge', 'package'), 'tub');
  assert.equal(shape('Tuna In Water Pouch', 'meats', 'pantry', 'pouch'), 'bag');
  assert.equal(shape('Mystery', 'dry_goods', 'pantry', 'Boxes'), 'box');
  assert.equal(packageShapeFromUnit('oz'), null);
  assert.ok(isFreshProduce({ category: 'produce', unit: 'bag' }) && !isFreshProduce({ category: 'produce', unit: 'jar' }));
  assert.equal(shape('Corn', 'produce', 'fridge'), 'crate', 'fresh produce is never drawn as a can');
  assert.equal(shape('Mystery thing', 'dry_goods', 'pantry', 'cans'), 'can', 'the unit can name the package');
  assert.equal(shape('Chicken thighs', 'meats', 'fridge'), 'tub');
  for (const s of PACKAGE_SHAPES) {
    const [top, bottom] = PACKAGE_LABEL_BOX[s];
    assert.ok(100 - top - bottom >= 36, `${s} label has room for a name and a size`);
  }
});

test('colours', () => {
  assert.equal(packageLabelColor('Tuna'), packageLabelColor('  tuna '), 'same item, same colour every time');
  assert.ok((PACKAGE_LABEL_COLORS as readonly string[]).includes(packageLabelColor('Anything')));
});

test('amounts and badges', () => {
  assert.deepEqual(shelfAmount({ quantity: 1, unit: 'each' }), { badge: null, size: null });
  assert.deepEqual(shelfAmount({ quantity: 3, unit: 'each' }), { badge: '×3', size: null });
  assert.deepEqual(shelfAmount({ quantity: 15, unit: 'oz' }), { badge: null, size: '15 oz' });
  assert.deepEqual(shelfAmount({ quantity: 1.5, unit: 'lb' }), { badge: null, size: '1.5 lb' });
  assert.deepEqual(shelfAmount({ quantity: 2, unit: 'lbs' }), { badge: null, size: '2 lbs' });
  assert.deepEqual(shelfAmount({ quantity: 1, unit: 'jar' }), { badge: null, size: null });
  assert.deepEqual(shelfAmount({ quantity: 2, unit: 'bottle' }), { badge: '×2', size: null });
  assert.deepEqual(shelfAmount({ quantity: 1, unit: 'chopped' }), { badge: null, size: null }, 'an odd unit is never printed');
  assert.equal(shelfDaysBadge({ expiresOn: null }, NOW), null);
  assert.equal(shelfDaysBadge({ expiresOn: '2026-10-10' }, NOW), 'Today');
  assert.equal(shelfDaysBadge({ expiresOn: '2026-10-13' }, NOW), '3d');
  assert.equal(shelfDaysBadge({ expiresOn: '2026-10-17' }, NOW), '7d');
  assert.equal(shelfDaysBadge({ expiresOn: '2026-10-18' }, NOW), null, 'outside the window');
  assert.equal(shelfDaysBadge({ expiresOn: '2026-10-08' }, NOW), 'Old');
});

const pantry: ShelvedItem[] = [
  item('Whole milk', 'dairy', 'fridge', { expiresOn: '2026-10-14' }),
  item('Strawberries', 'produce', 'fridge', { expiresOn: '2026-10-11' }),
  item('Eggs', 'dairy', 'fridge', { quantity: 12 }),
  item('Cheddar', 'dairy', 'fridge'),
  item('Apples', 'produce', 'fridge', { quantity: 6 }),
  item('Ketchup', 'condiments', 'fridge'),
  item('Leftover rice', 'dry_goods', 'fridge'),
  item('Tomato sauce', 'dry_goods', 'pantry', { quantity: 3 }),
  item('Spaghetti', 'dry_goods', 'pantry', { quantity: 16, unit: 'oz' }),
  item('Flour', 'dry_goods', 'pantry'),
  item('Olive oil', 'condiments', 'pantry'),
  item('Paprika', 'spices', 'spice_rack'),
];

test('shelves per place', () => {
  const fridge = buildPantryShelves(pantry, 'fridge', NOW);
  assert.deepEqual(fridge.map((s) => s.name), ['Use soon', 'Dairy and eggs', 'Produce', 'Condiments', 'Other']);
  assert.deepEqual(fridge[0]!.tiles.map((t) => t.item.name), ['Strawberries', 'Whole milk'], 'soonest first');
  assert.deepEqual(fridge[1]!.tiles.map((t) => t.item.name), ['Cheddar', 'Eggs'], 'milk is on Use soon only');
  assert.equal(fridge[1]!.tiles[1]!.quantityBadge, '×12');
  assert.deepEqual(fridge[1]!.seeAll, { location: 'fridge', category: 'dairy' });
  assert.deepEqual(fridge[0]!.seeAll, { location: 'fridge', category: 'all' });
  assert.match(fridge[0]!.tiles[0]!.a11yLabel, /Strawberries, 1 days left/);

  const shelf = buildPantryShelves(pantry, 'pantry', NOW);
  assert.deepEqual(shelf.map((s) => s.name), ['Dry goods', 'Canned goods', 'Boxed goods', 'Condiments']);
  assert.equal(shelf[2]!.tiles[0]!.sizeLabel, '16 oz');
  assert.deepEqual(buildPantryShelves(pantry, 'spice_rack', NOW).map((s) => s.name), ['Spices']);
  assert.deepEqual(buildPantryShelves([], 'fridge', NOW), [], 'an empty place has no shelves');
});

test('sealed "produce" does not sit on the Produce shelf', () => {
  const mixed = [
    item('Grape', 'produce', 'fridge', { unit: 'bag' }),
    item('Pepperoncini', 'produce', 'fridge', { unit: 'jar' }),
    item('Onions', 'produce', 'pantry'),
    item('Peach', 'produce', 'pantry', { unit: 'jar' }),
  ];
  const mixedFridge = buildPantryShelves(mixed, 'fridge', NOW);
  assert.deepEqual(mixedFridge.map((s) => [s.name, s.tiles.map((t) => t.shape)]), [['Produce', ['crate']], ['Condiments', ['jar']]]);
  const mixedPantry = buildPantryShelves(mixed, 'pantry', NOW);
  assert.deepEqual(mixedPantry.map((s) => [s.name, s.tiles.map((t) => t.shape)]), [['Canned goods', ['jar']], ['Produce', ['crate']]]);
  for (const place of SHELF_PLACES) {
    for (const s of buildPantryShelves([...pantry, ...mixed], place, NOW)) {
      if (s.name === 'Produce') assert.ok(s.tiles.every((t) => t.shape === 'crate'), 'everything on a Produce shelf is in a crate');
    }
  }
});

test('every item is drawn exactly once per place', () => {
  for (const place of SHELF_PLACES) {
    const drawn = buildPantryShelves(pantry, place, NOW).flatMap((s) => s.tiles.map((t) => t.item.id));
    const owned = pantry.filter((p) => p.location === place).map((p) => p.id);
    assert.deepEqual([...drawn].sort(), [...owned].sort(), `${place}: no item lost or drawn twice`);
  }
});

test('a big spice rack splits by first letter', () => {
  const spices = 'Basil,Bay leaves,Cayenne,Cinnamon,Cumin,Garlic powder,Nutmeg,Oregano,Paprika,Salt,Thyme'
    .split(',')
    .map((n) => item(n, 'spices', 'spice_rack'));
  assert.deepEqual(
    buildPantryShelves(spices, 'spice_rack', NOW).map((s) => [s.name, s.count]),
    [
      ['Spices A to G', 6],
      ['Spices H to Z', 5],
    ],
  );
});

test('a long shelf is capped, with the rest behind one "+N more" tile', () => {
  const cans = Array.from({ length: SHELF_MAX_TILES + 5 }, (_, i) => item(`Soup ${i + 10}`, 'dry_goods', 'pantry'));
  const longShelf = buildPantryShelves(cans, 'pantry', NOW)[0]!;
  assert.equal(longShelf.name, 'Canned goods');
  assert.equal(longShelf.count, SHELF_MAX_TILES + 5);
  assert.equal(longShelf.tiles.length, SHELF_MAX_TILES);
  assert.equal(longShelf.moreCount, 5);
  assert.equal(SHELF_VIEW_COPY.moreTile(5), '+5 more');
});

test('header line, place choice and labels', () => {
  assert.deepEqual(pantryShelfSummary(pantry, NOW), { total: 12, soon: 2 });
  assert.equal(SHELF_VIEW_COPY.summary(12, 2), '12 items · 2 to use soon');
  assert.equal(SHELF_VIEW_COPY.summary(1, 0), '1 item');
  assert.equal(resolveShelfPlace('spice_rack', pantry), 'spice_rack');
  assert.equal(resolveShelfPlace('all', pantry), 'fridge');
  assert.equal(resolveShelfPlace('all', [{ location: 'spice_rack' }]), 'spice_rack', 'first place with something in it');
  assert.equal(resolveShelfPlace('all', []), 'fridge');
  assert.ok(isPantryViewMode('shelves') && isPantryViewMode('list') && !isPantryViewMode('grid'));
  // Owner's decision: the fridge is called "Refrigerator" on the shelves view.
  assert.equal(SHELF_VIEW_COPY.placeLabels.fridge, 'Refrigerator');
  assert.deepEqual([...SHELF_PLACES], ['fridge', 'pantry', 'spice_rack']);
});
