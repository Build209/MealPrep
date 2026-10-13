import type { PantryCategory } from '../../kitchen/categories';
import { daysUntilPantryExpiry } from '../../kitchen/expiry';
import type { PantryStorageLocation } from '../../kitchen/storage';
import type { ShelvedItem as PantryItem } from '../types';
import {
  isFreshProduce,
  packageLabelColor,
  packageShapeFor,
  produceColor,
  SHELF_MAX_TILES,
  SHELF_PLACES,
  SHELF_SPICE_SPLIT_OVER,
  SHELF_VIEW_COPY,
  shelfAmount,
  shelfDaysBadge,
  type PackageShape,
} from './packages';

/** Shelves for one storage place. Copied from the old app (mobile/lib/pantry/shelfView.ts). */

export interface ShelfTile {
  item: PantryItem;
  shape: PackageShape;
  labelColor: string;
  produceColor: string;
  quantityBadge: string | null;
  sizeLabel: string | null;
  daysBadge: string | null;
  a11yLabel: string;
}

export interface PantryShelf {
  id: string;
  name: string;
  /** Every item on the shelf. */
  count: number;
  /** The first SHELF_MAX_TILES of them, ready to draw. */
  tiles: ShelfTile[];
  /** Items not drawn; shown as one "+N more" tile. */
  moreCount: number;
  /** Where "See all" lands in the list view. */
  seeAll: { location: PantryStorageLocation; category: PantryCategory | 'all' };
}

function tileFor(item: PantryItem, now: Date): ShelfTile {
  const amount = shelfAmount(item);
  const daysBadge = shelfDaysBadge(item, now);
  const parts = [item.name];
  if (amount.size) parts.push(amount.size);
  if (amount.badge) parts.push(`quantity ${amount.badge.slice(1)}`);
  if (daysBadge === 'Old') parts.push('past its date');
  else if (daysBadge === 'Today') parts.push('use today');
  else if (daysBadge) parts.push(`${daysBadge.slice(0, -1)} days left`);
  return {
    item,
    shape: packageShapeFor(item),
    labelColor: packageLabelColor(item.name),
    produceColor: produceColor(item.name),
    quantityBadge: amount.badge,
    sizeLabel: amount.size,
    daysBadge,
    a11yLabel: parts.join(', '),
  };
}

interface ShelfSpec {
  id: string;
  name: string;
  category: PantryCategory | 'all';
}

const OTHER: ShelfSpec = { id: 'other', name: 'Other', category: 'all' };

const FRIDGE_SHELVES: readonly ShelfSpec[] = [
  { id: 'dairy', name: 'Dairy and eggs', category: 'dairy' },
  { id: 'produce', name: 'Produce', category: 'produce' },
  { id: 'meats', name: 'Meats', category: 'meats' },
  { id: 'condiments', name: 'Condiments', category: 'condiments' },
  { id: 'frozen', name: 'Frozen', category: 'frozen' },
  OTHER,
];

const PANTRY_SHELVES: readonly ShelfSpec[] = [
  { id: 'dry', name: 'Dry goods', category: 'dry_goods' },
  { id: 'canned', name: 'Canned goods', category: 'dry_goods' },
  { id: 'boxed', name: 'Boxed goods', category: 'dry_goods' },
  { id: 'produce', name: 'Produce', category: 'produce' },
  { id: 'condiments', name: 'Condiments', category: 'condiments' },
  { id: 'spices', name: 'Spices', category: 'spices' },
  OTHER,
];

function shelfIdFor(item: PantryItem, location: PantryStorageLocation, shape: PackageShape): string {
  if (location === 'fridge') {
    if (item.category === 'dairy' || /\beggs?\b/i.test(item.name)) return 'dairy';
    // Jarred, canned or tubed "produce" is a condiment as far as the fridge shelves go.
    if (item.category === 'produce' && !isFreshProduce(item)) return 'condiments';
    if (FRIDGE_SHELVES.some((s) => s.category === item.category)) return item.category;
    return 'other';
  }
  // pantry
  if (item.category === 'dry_goods') {
    if (shape === 'can') return 'canned';
    if (shape === 'box') return 'boxed';
    return 'dry';
  }
  if (item.category === 'produce') {
    if (isFreshProduce(item)) return 'produce';
    return shape === 'can' || shape === 'jar' ? 'canned' : 'other';
  }
  if (item.category === 'condiments' || item.category === 'spices') return item.category;
  if (shape === 'can') return 'canned';
  return 'other';
}

function makeShelf(
  spec: ShelfSpec,
  tiles: ShelfTile[],
  location: PantryStorageLocation,
): PantryShelf {
  return {
    id: spec.id,
    name: spec.name,
    count: tiles.length,
    tiles: tiles.slice(0, SHELF_MAX_TILES),
    moreCount: Math.max(0, tiles.length - SHELF_MAX_TILES),
    seeAll: { location, category: spec.category },
  };
}

/**
 * The shelves for one storage place, top to bottom. "Use soon" comes first and holds every dated
 * item inside the window (soonest first, past-date items before them); an item on it is not drawn
 * again further down. Shelves with nothing on them are left out.
 */
export function buildPantryShelves(
  items: readonly PantryItem[],
  location: PantryStorageLocation,
  now = new Date(),
): PantryShelf[] {
  const here = items.filter((item) => item.location === location);
  const tiles = here.map((item) => tileFor(item, now)).sort((a, b) => a.item.name.localeCompare(b.item.name));

  const soon = tiles
    .filter((tile) => tile.daysBadge !== null)
    .sort((a, b) => {
      const byDays = (daysUntilPantryExpiry(a.item, now) ?? 0) - (daysUntilPantryExpiry(b.item, now) ?? 0);
      return byDays !== 0 ? byDays : a.item.name.localeCompare(b.item.name);
    });
  const rest = tiles.filter((tile) => tile.daysBadge === null);

  const shelves: PantryShelf[] = [];
  if (soon.length > 0) {
    shelves.push(makeShelf({ id: 'use-soon', name: SHELF_VIEW_COPY.useSoon, category: 'all' }, soon, location));
  }

  if (location === 'spice_rack') {
    if (rest.length > SHELF_SPICE_SPLIT_OVER) {
      const early = rest.filter((tile) => tile.item.name.trim().toLowerCase() < 'h');
      const late = rest.filter((tile) => !(tile.item.name.trim().toLowerCase() < 'h'));
      if (early.length > 0 && late.length > 0) {
        shelves.push(makeShelf({ id: 'spices-a-g', name: 'Spices A to G', category: 'all' }, early, location));
        shelves.push(makeShelf({ id: 'spices-h-z', name: 'Spices H to Z', category: 'all' }, late, location));
        return shelves;
      }
    }
    if (rest.length > 0) {
      shelves.push(makeShelf({ id: 'spices', name: 'Spices', category: 'all' }, rest, location));
    }
    return shelves;
  }

  const specs = location === 'fridge' ? FRIDGE_SHELVES : PANTRY_SHELVES;
  const byShelf = new Map<string, ShelfTile[]>();
  for (const tile of rest) {
    const id = shelfIdFor(tile.item, location, tile.shape);
    const list = byShelf.get(id) ?? [];
    list.push(tile);
    byShelf.set(id, list);
  }
  for (const spec of specs) {
    const list = byShelf.get(spec.id);
    if (list && list.length > 0) shelves.push(makeShelf(spec, list, location));
  }
  return shelves;
}

/** Header line numbers: everything owned, and how many dated items are inside the "use soon" window. */
export function pantryShelfSummary(items: readonly PantryItem[], now = new Date()): { total: number; soon: number } {
  let soon = 0;
  for (const item of items) {
    if (shelfDaysBadge(item, now) !== null) soon += 1;
  }
  return { total: items.length, soon };
}

/**
 * Which place the shelves view shows. The list view's "All" has no shelf equivalent, so it
 * falls to the first place that has something in it (fridge, then pantry, then spice rack).
 */
export function resolveShelfPlace(
  filter: PantryStorageLocation | 'all',
  items: readonly Pick<PantryItem, 'location'>[],
): PantryStorageLocation {
  if (filter !== 'all') return filter;
  return SHELF_PLACES.find((place) => items.some((item) => item.location === place)) ?? 'fridge';
}
