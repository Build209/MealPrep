import { daysUntilPantryExpiry } from '../../kitchen/expiry';
import type { PantryStorageLocation } from '../../kitchen/storage';
import type { ShelvedItem as PantryItem } from '../types';

/**
 * Pantry "shelves" view (owner's mockup B, sideways shelves): every item is drawn as a package
 * standing on a shelf, one storage place at a time. Copied from the old app
 * (mobile/lib/pantry/shelfView.ts), split in two: packages and badges here, shelves in
 * shelfView.ts. Plain data, so it can be checked without a screen; the drawing is PantryShelves.tsx.
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
  scanA11y: 'Scan your fridge or pantry',
  scanReceipt: 'Scan a receipt',
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
  bag: [30, 16, 12],
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

/** Units that name the package an item came in, and the drawing that goes with each. */
const UNIT_SHAPES: Readonly<Record<string, PackageShape>> = {
  can: 'can',
  jar: 'jar',
  bottle: 'bottle',
  tube: 'bottle',
  carton: 'carton',
  jug: 'jug',
  box: 'box',
  bag: 'bag',
  pouch: 'bag',
  sack: 'bag',
  tub: 'tub',
  container: 'tub',
  tray: 'tub',
  package: 'tub',
  pack: 'tub',
  pkg: 'tub',
};

function singularUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === 'boxes') return 'box';
  return u.endsWith('s') && u.length > 2 ? u.slice(0, -1) : u;
}

/** The package named by the item's unit ("2 jar", "1 can"), or null for a count or a measure. */
export function packageShapeFromUnit(unit: string): PackageShape | null {
  return UNIT_SHAPES[singularUnit(unit)] ?? null;
}

/**
 * Fresh fruit and vegetables: the produce category, unless the unit says it came sealed in a
 * jar, can, bottle, tube or the like (jarred peppers, ginger paste). A bag of grapes is fresh.
 */
export function isFreshProduce(item: Pick<PantryItem, 'category' | 'unit'>): boolean {
  if (item.category !== 'produce') return false;
  const fromUnit = packageShapeFromUnit(item.unit);
  return fromUnit === null || fromUnit === 'bag';
}

/** Which package to draw for an item. A guess from its unit, name, category and place; never stored. */
export function packageShapeFor(
  item: Pick<PantryItem, 'name' | 'category' | 'location' | 'unit'>,
): PackageShape {
  const name = item.name.toLowerCase();
  if (item.location === 'spice_rack' || item.category === 'spices') return 'shaker';
  // Fresh produce is always loose in a crate, never in a jar, bottle or bag.
  if (isFreshProduce(item)) return 'crate';
  const fromUnit = packageShapeFromUnit(item.unit);
  if (fromUnit) return fromUnit;
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
  return PACKAGE_LABEL_COLORS[hash % PACKAGE_LABEL_COLORS.length] ?? PACKAGE_LABEL_COLORS[0];
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

/** Units that measure an amount. Only these are printed on the label ("15 oz"). */
const MEASURE_UNITS = new Set([
  'oz', 'ounce', 'fl oz', 'floz', 'lb', 'pound', 'g', 'gram', 'kg', 'ml', 'l', 'liter', 'litre',
  'gal', 'gallon', 'qt', 'quart', 'pt', 'pint', 'cup', 'tbsp', 'tsp', 'dozen',
]);

function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/**
 * What the package says about how much there is. A measured amount ("15 oz") is printed on the
 * label. Anything else is a count of packages ("3 each", "2 jar"): the drawing already shows
 * the jar, so it becomes the round "×2" badge, and nothing at all for a single one.
 */
export function shelfAmount(item: Pick<PantryItem, 'quantity' | 'unit'>): {
  badge: string | null;
  size: string | null;
} {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unit = item.unit.trim().toLowerCase();
  if (MEASURE_UNITS.has(unit) || MEASURE_UNITS.has(singularUnit(unit))) {
    return { badge: null, size: quantity > 0 ? `${trimNumber(quantity)} ${item.unit.trim()}` : null };
  }
  return { badge: quantity > 1 ? `×${trimNumber(quantity)}` : null, size: null };
}

/** Yellow corner badge on a package that should be used soon: "3d", "Today", or "Old" once past its date. */
export function shelfDaysBadge(item: Pick<PantryItem, 'expiresOn'>, now = new Date()): string | null {
  const days = daysUntilPantryExpiry(item, now);
  if (days === null || days > SHELF_USE_SOON_DAYS) return null;
  if (days < 0) return 'Old';
  if (days === 0) return 'Today';
  return `${days}d`;
}
