/**
 * Quantity + unit to grams for one ingredient line. Pure (tests/nutrition-grams.test.ts).
 * Mass units convert exactly. Volume units need a density and counts need a typical weight, taken
 * from the small approximate tables below; an ingredient not in them returns null and is skipped
 * (never guessed). The figures are common kitchen conversions (about one cup of flour = 125 g).
 */
import { convertQuantity, normalizeUnit, unitKind } from '../kitchen/unitConversion';

/** Grams per millilitre. Earlier entries win, so list the specific phrase before the general word. */
const DENSITY_G_PER_ML: ReadonlyArray<readonly [string, number]> = [
  ['peanut butter', 1.08],
  ['brown sugar', 0.93],
  ['powdered sugar', 0.5],
  ['confectioners', 0.5],
  ['sugar', 0.85],
  ['flour', 0.53],
  ['olive oil', 0.92],
  ['vegetable oil', 0.92],
  ['canola oil', 0.92],
  ['coconut oil', 0.92],
  ['oil', 0.92],
  ['butter', 0.96],
  ['milk', 1.03],
  ['heavy cream', 1.0],
  ['sour cream', 1.0],
  ['cream', 1.0],
  ['yogurt', 1.03],
  ['honey', 1.42],
  ['maple syrup', 1.33],
  ['soy sauce', 1.1],
  ['mayonnaise', 0.96],
  ['water', 1.0],
  ['broth', 1.0],
  ['stock', 1.0],
  ['vinegar', 1.0],
  ['wine', 0.99],
  ['rice', 0.78],
  ['oats', 0.34],
  ['parmesan', 0.4],
  ['cheese', 0.45],
  ['cocoa', 0.36],
  ['breadcrumb', 0.47],
  ['salt', 1.2],
];

/** Grams for one piece. */
const EACH_GRAMS: ReadonlyArray<readonly [string, number]> = [
  ['egg', 50],
  ['onion', 110],
  ['tomato', 120],
  ['potato', 170],
  ['carrot', 60],
  ['apple', 180],
  ['banana', 120],
  ['bell pepper', 120],
  ['avocado', 150],
];

const SIZE_UNITS = new Set(['', 'each', 'ea', 'piece', 'pieces', 'item', 'items', 'whole', 'large', 'medium', 'small', 'extra large', 'extra-large', 'xl']);
const CLOVE_GRAMS = 3;

function hasPhrase(name: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z])${phrase}(s|es)?($|[^a-z])`).test(name);
}

function lookup(table: ReadonlyArray<readonly [string, number]>, name: string): number | null {
  const lower = name.toLowerCase();
  for (const [phrase, value] of table) if (hasPhrase(lower, phrase)) return value;
  return null;
}

export function gramsForIngredient(name: string, quantity: number | null | undefined, unit: string | null | undefined): number | null {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) return null;
  const u = normalizeUnit(unit ?? '');
  if (u === 'clove' || u === 'cloves') return hasPhrase(name.toLowerCase(), 'garlic') ? quantity * CLOVE_GRAMS : null;
  if (SIZE_UNITS.has(u)) {
    const each = lookup(EACH_GRAMS, name);
    return each === null ? null : quantity * each;
  }
  if (u === 'dozen' || u === 'doz') {
    const each = lookup(EACH_GRAMS, name);
    return each === null ? null : quantity * 12 * each;
  }
  const kind = unitKind(u);
  if (kind === 'mass') return convertQuantity(quantity, u, 'g');
  if (kind === 'volume') {
    const ml = convertQuantity(quantity, u, 'ml');
    const density = lookup(DENSITY_G_PER_ML, name);
    return ml === null || density === null ? null : ml * density;
  }
  return null;
}
