/**
 * Convert quantities within mass, volume or count families. Copied from the old app
 * (mobile/lib/units/conversion.ts); same tables and rules. Pure (tests/kitchen-recipe-match.test.ts).
 */

export type UnitKind = 'mass' | 'volume' | 'count';

const MASS_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  cup: 236.588,
  cups: 236.588,
  qt: 946.353,
  quart: 946.353,
  quarts: 946.353,
  gal: 3785.41,
  gallon: 3785.41,
  gallons: 3785.41,
  pinch: 0.3,
};

/** Count units that convert to "each" with a fixed multiplier (dozen = 12 each). */
const COUNT_TO_EACH: Record<string, number> = {
  each: 1,
  ea: 1,
  piece: 1,
  pieces: 1,
  item: 1,
  items: 1,
  dozen: 12,
  doz: 12,
};

/** Count units that are not interchangeable with "each" (a can is not one item). */
const COUNT_DISTINCT_UNITS = new Set([
  'bunch',
  'can',
  'cans',
  'jar',
  'jars',
  'head',
  'heads',
  'clove',
  'cloves',
  'pinch',
  'pinches',
]);

export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase();
}

function countUnitToEachFactor(unit: string): number | null {
  const u = normalizeUnit(unit);
  if (!u) return null;
  return COUNT_TO_EACH[u] ?? null;
}

export function unitKind(unit: string): UnitKind | null {
  const u = normalizeUnit(unit);
  if (!u) return null;
  if (countUnitToEachFactor(u) !== null || COUNT_DISTINCT_UNITS.has(u)) return 'count';
  if (u in MASS_TO_GRAMS) return 'mass';
  if (u in VOLUME_TO_ML) return 'volume';
  return null;
}

export function unitsAreConvertible(a: string, b: string): boolean {
  const from = normalizeUnit(a);
  const to = normalizeUnit(b);
  if (from === to) return true;

  const ka = unitKind(from);
  const kb = unitKind(to);
  if (ka === null || kb === null || ka !== kb) return false;

  if (ka === 'count') {
    return countUnitToEachFactor(from) !== null && countUnitToEachFactor(to) !== null;
  }
  return true;
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return quantity;

  const kind = unitKind(from);
  if (kind === null || kind !== unitKind(to)) return null;

  if (kind === 'count') {
    const fromEach = countUnitToEachFactor(from);
    const toEach = countUnitToEachFactor(to);
    if (fromEach === null || toEach === null) return null;
    return (quantity * fromEach) / toEach;
  }

  const table = kind === 'mass' ? MASS_TO_GRAMS : VOLUME_TO_ML;
  const fromFactor = table[from];
  const toFactor = table[to];
  if (fromFactor === undefined || toFactor === undefined) return null;
  return (quantity * fromFactor) / toFactor;
}
