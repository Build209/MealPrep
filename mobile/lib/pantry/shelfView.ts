import type { PantryStorageLocation } from '../../config/pantryStorage';
import type { PantryCategory, PantryItem } from '../../types/mealprep';
import { daysUntilPantryExpiry } from './expiry';

/**
 * Pantry "shelves" view (owner's mockup B, sideways shelves): every item is drawn as a package
 * standing on a shelf, one storage place at a time. Everything here is plain data so it can be
 * checked without a screen; the drawing lives in components/pantry/PantryShelves.tsx.
 */

export type PantryViewMode = 'shelves' | 'list';
export const DEFAULT_PANTRY_VIEW_MODE: PantryViewMode = 'shelves';
export const PANTRY_VIEW_MODE_STORAGE_KEY = 'mealprep.pantryViewMode';

export function isPantryViewMode(value: unknown): value is PantryViewMode {
  return value === 'shelves' || value === 'list';
}

/** Order of the place chips in the shelves view (the fridge comes first, as in the mockup). */
export const SHELF_PLACES: readonly PantryStorageLocation[] = ['fridge', 'pantry', 'spice_rack'];

export const SHELF_VIEW_COPY = {
  shelves: 'Shelves',
  list: 'List',
  viewToggleA11y: 'Pantry view',
  seeAll: 'See all',
  useSoon: 'Use soon',
  scanLabel: 'Scan',
  scanA11y: 'Scan your fridge, pantry or a receipt',
  hideScanA11y: 'Hide scan options',
  placeLabels: { fridge: 'Refrigerator', pantry: 'Pantry', spice_rack: 'Spice rack' } as Record<
    PantryStorageLocation,
    string
  >,
  emptyPlace: (place: string) => `Nothing in your ${place.toLowerCase()} yet.`,
  moreTile: (count: number) => `+${count} more`,
  summary: (total: number, soon: number) => {
    const items = `${total} item${total === 1 ? '' : 's'}`;
    return soon > 0 ? `${items} · ${soon} to use soon` : items;
  },
} as const;

/** Days ahead that put a dated item on the "Use soon" shelf (same window as the list view). */
export const SHELF_USE_SOON_DAYS = 7;
/** Packages drawn per shelf before the "+N more" tile. Keeps a 200-item pantry quick to draw. */
export const SHELF_MAX_TILES = 12;
/** A spice rack with more jars than this is split into two shelves by first letter. */
export const SHELF_SPICE_SPLIT_OVER = 8;

export const PACKAGE_SHAPES = [
  'can',
  'jug',
  'carton',
  'jar',
  'bottle',
  'box',
  'bag',
  'tub',
  'crate',
  'shaker',
] as const;
export type PackageShape = (typeof PACKAGE_SHAPES)[number];

/** Where the printed label sits on each package, in the 76 x 100 drawing: [top, bottom, side inset]. */
export const PACKAGE_LABEL_BOX: Record<PackageShape, readonly [number, number, number]> = {
  can: [26, 12, 6],
  jug: [50, 8, 10],
  carton: [36, 8, 12],
  jar: [42, 12, 10],
  bottle: [50, 10, 14],
  box: [24, 8, 12],
  bag: [44, 10, 12],
  tub: [52, 6, 14],
  crate: [56, 5, 10],
  shaker: [46, 8, 12],
};

/** Label colours from the mockup; all dark enough for white text. */
export const PACKAGE_LABEL_COLORS = [
  '#B23A1B',
  '#1F4D33',
  '#1F4E79',
  '#6B4423',
  '#5B3A6B',
  '#7A5A0C',
  '#1D5B5E',
  '#A14A12',
] as const;

const FRUIT_COLORS = {
  red: '#D9482B',
  green: '#4E9A5B',
  yellow: '#E9B23B',
  orange: '#E58A2B',
  purple: '#7B4B94',
  brown: '#A9743F',
} as const;

function has(name: string, pattern: RegExp): boolean {
  return pattern.test(name);
}

// Checked in this order: the first list that matches wins, so "peanut butter" is a jar before
// "butter" is a box, and "coconut milk" is a can before "milk" is a jug.
const SHAPE_RULES: readonly (readonly [PackageShape, RegExp])[] = [
  [
    'can',
    /\b(canned|can of|cans?)\b|\b(tomato (sauce|paste)|diced tomato|crushed tomato|coconut milk|evaporated milk|condensed milk|tuna|sardines?|anchov|spam|chickpeas?|garbanzo|refried|baked beans|black beans|kidney beans|pinto beans in|soup|chili beans|green chiles?|enchilada sauce|pumpkin puree|cranberry sauce)\b/,
  ],
  [
    'jar',
    /\b(jam|jelly|preserves|marmalade|salsa|peanut butter|almond butter|nut butter|mayo|mayonnaise|honey|pickles?|olives|pesto|relish|nutella|tahini|capers|marinara|pasta sauce|spaghetti sauce|alfredo|applesauce|minced garlic|sauerkraut|kimchi|curry paste|miso|molasses|jarred|bouillon paste)\b/,
  ],
  [
    'tub',
    /\b(yogurt|yoghurt|sour cream|cottage cheese|cream cheese|hummus|leftovers?|ricotta|margarine|dip|deli|ice cream|feta|parmesan|guacamole|whipped|lard|shortening|tofu|lunch ?meat)\b/,
  ],
  [
    'bottle',
    /\b(sauce|ketchup|catsup|mustard|oil|vinegar|syrup|dressing|sriracha|wine|vanilla|extract|water|soda|beer|marinade|worcestershire|lemon juice|lime juice|liquid smoke|mirin|sake|bbq|teriyaki|aminos|kombucha)\b/,
  ],
  ['jug', /\b(milk|creamer)\b/],
  ['carton', /\b(juice|half and half|half-and-half|cream|buttermilk|egg whites?|broth|stock|eggnog|lemonade)\b/],
  [
    'box',
    /\b(eggs?|butter|pasta|spaghetti|penne|macaroni|noodles?|linguine|fettuccine|rotini|lasagna|cereal|crackers?|oats|oatmeal|baking soda|baking powder|cornstarch|mix|tea|granola bars?|couscous|bouillon|gelatin|pudding|pizza|waffles?|stuffing|breadcrumbs?|panko|taco shells?|foil|wrap|sticks?|popsicles?)\b/,
  ],
];

const LEAFY_OR_BAGGED = /\b(spinach|lettuce|kale|arugula|salad|greens|herbs?|cilantro|parsley|basil|celery|carrots?|grapes?|green beans|sprouts|mushrooms?|broccoli|cauliflower|chard|cabbage|scallions?|green onions?|berries|peas)\b/;

/** Which package to draw for an item. A guess from its name, category and place; never stored. */
export function packageShapeFor(
  item: Pick<PantryItem, 'name' | 'category' | 'location' | 'unit'>,
): PackageShape {
  const name = item.name.toLowerCase();
  if (item.location === 'spice_rack' || item.category === 'spices') return 'shaker';
  if (item.category === 'produce') return has(name, LEAFY_OR_BAGGED) ? 'bag' : 'crate';
  const unit = item.unit.toLowerCase();
  if (/\bcans?\b/.test(unit)) return 'can';
  if (/\bjars?\b/.test(unit)) return 'jar';
  if (/\bbottles?\b/.test(unit)) return 'bottle';
  if (/\b(box|boxes)\b/.test(unit)) return 'box';
  if (/\bbags?\b/.test(unit)) return 'bag';
  for (const [shape, pattern] of SHAPE_RULES) {
    if (has(name, pattern)) return shape;
  }
  switch (item.category) {
    case 'dairy':
      return /cheese|cheddar|mozzarella|jack|swiss|provolone/.test(name) ? 'bag' : 'carton';
    case 'meats':
      return 'tub';
    case 'condiments':
      return 'bottle';
    case 'cookware':
      return 'box';
    case 'frozen':
    case 'dry_goods':
    default:
      return 'bag';
  }
}

/** A steady label colour per item name, so a package looks the same every time it is drawn. */
export function packageLabelColor(name: string): string {
  const key = name.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PACKAGE_LABEL_COLORS[hash % PACKAGE_LABEL_COLORS.length];
}

/** Colour of the loose produce drawn in a crate. */
export function produceColor(name: string): string {
  const n = name.toLowerCase();
  if (/apple|strawberr|tomato|cherr|raspberr|radish|red pepper|beet|pomegranate|watermelon/.test(n)) {
    return FRUIT_COLORS.red;
  }
  if (/lemon|banana|corn|squash|pineapple|yellow/.test(n)) return FRUIT_COLORS.yellow;
  if (/orange|carrot|peach|mango|pumpkin|sweet potato|yam|apricot|clementine|tangerine|cantaloupe/.test(n)) {
    return FRUIT_COLORS.orange;
  }
  if (/grape|plum|eggplant|red onion|blueberr|blackberr|fig|red cabbage/.test(n)) return FRUIT_COLORS.purple;
  if (/potato|onion|garlic|ginger|mushroom|shallot|kiwi|coconut|pear/.test(n)) return FRUIT_COLORS.brown;
  return FRUIT_COLORS.green;
}

const COUNT_UNITS = new Set(['', 'each', 'ea', 'x', 'ct', 'count', 'item', 'items', 'pc', 'pcs', 'piece', 'pieces', 'unit', 'units']);

function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/**
 * What the package says about how much there is. A plain count ("3 each") becomes the round
 * "×3" badge and nothing for a single one; anything measured ("15 oz") is printed on the label.
 */
export function shelfAmount(item: Pick<PantryItem, 'quantity' | 'unit'>): {
  badge: string | null;
  size: string | null;
} {
  const unit = item.unit.trim().toLowerCase();
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  if (COUNT_UNITS.has(unit)) {
    return { badge: quantity > 1 ? `×${trimNumber(quantity)}` : null, size: null };
  }
  if (quantity <= 0) return { badge: null, size: null };
  return { badge: null, size: `${trimNumber(quantity)} ${item.unit.trim()}` };
}

/** Yellow corner badge on a package that should be used soon: "3d", "Today", or "Old" once past its date. */
export function shelfDaysBadge(item: Pick<PantryItem, 'expiresOn'>, now = new Date()): string | null {
  const days = daysUntilPantryExpiry(item, now);
  if (days === null || days > SHELF_USE_SOON_DAYS) return null;
  if (days < 0) return 'Old';
  if (days === 0) return 'Today';
  return `${days}d`;
}

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
    if (FRIDGE_SHELVES.some((s) => s.category === item.category)) return item.category;
    return 'other';
  }
  // pantry
  if (item.category === 'dry_goods') {
    if (shape === 'can') return 'canned';
    if (shape === 'box') return 'boxed';
    return 'dry';
  }
  if (item.category === 'produce' || item.category === 'condiments' || item.category === 'spices') {
    return item.category;
  }
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
  return SHELF_PLACES.find((place) => items.some((item) => item.location === place)) ?? SHELF_PLACES[0];
}
