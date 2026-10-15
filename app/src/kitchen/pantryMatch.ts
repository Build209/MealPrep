/**
 * Matching scanned items against what is already in the pantry, ported from the old app:
 * - mobile/lib/pantryVision/matchIngredients.ts (matchDetectionToCatalog, scoreMatch)
 * - mobile/lib/pantryVision/reviewItems.ts (filterDetectionsNotAlreadyInPantry)
 * - mobile/lib/pantry/mergePantryStock.ts (pantryItemsMatch, the same-unit top-up)
 * - mobile/lib/pantryVision/detectionParse.ts (formatDetectedIngredientName)
 *
 * Shelf, fridge and spice rack scans: an item already in the pantry is the same thing on the
 * shelf, so it is shown as "already in your pantry" and left out unless the person adds it.
 * Receipts: the person bought more, so a matching row with the same unit gets the quantity
 * added. A different unit is saved as its own row (the old app converted units; the unit
 * bridge is not ported yet, so nothing is guessed).
 *
 * Pure functions only (tests/kitchen-pantry-match.test.ts).
 */
import {
  areSameIngredientForPantryDedupe,
  canonicalIngredientPhrase,
  fuzzyNameScore,
  ingredientMatchScore,
  normalizeIngredientName,
} from './ingredientNormalize';

/** The fields of a pantry row the matcher reads. */
export type PantryMatchRow = {
  id: string;
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
};

/** Old app: a catalog match needs this score (matchDetectionToCatalog). */
export const CATALOG_MATCH_SCORE = 0.72;
/** Old app: a fuzzy name score this high merges two pantry rows (pantryItemsMatch). */
export const MERGE_FUZZY_SCORE = 0.92;

function titleCaseToken(token: string): string {
  return token ? token.charAt(0).toUpperCase() + token.slice(1) : token;
}

/** "Kirkland Organic Black Beans" -> "Black Beans" (old app: formatDetectedIngredientName). */
export function formatDetectedIngredientName(rawName: string): string {
  const trimmed = rawName.replace(/\[demo sample\]/gi, '').trim();
  if (!trimmed) return rawName.trim();
  const phrase = canonicalIngredientPhrase(trimmed);
  if (!phrase) return trimmed;
  return phrase.split(' ').map(titleCaseToken).join(' ');
}

/** Old app slug for an unmatched detection ("Black Beans" -> "black-beans"). */
export function slugIngredientId(name: string): string {
  const slug = formatDetectedIngredientName(name).toLowerCase().replace(/\s+/g, '-');
  return slug || 'ingredient';
}

function scoreMatch(detectionName: string, candidateName: string): number {
  const hierarchical = ingredientMatchScore(detectionName, candidateName);
  if (hierarchical > 0) return hierarchical;
  return fuzzyNameScore(detectionName, candidateName);
}

/** The pantry row a scanned name best matches (score at least 0.72), or null. */
export function bestPantryMatch<T extends PantryMatchRow>(name: string, pantry: readonly T[]): T | null {
  const formatted = formatDetectedIngredientName(name);
  if (!formatted) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const row of pantry) {
    const score = scoreMatch(formatted, row.name);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best && bestScore >= CATALOG_MATCH_SCORE ? best : null;
}

/**
 * Shelf scans: the pantry row this scanned item already is, or null when it is new
 * (old app: filterDetectionsNotAlreadyInPantry). Same ingredient id, or the same ingredient
 * by name (exact phrase or a synonym group).
 */
export function findAlreadyInPantry<T extends PantryMatchRow>(name: string, pantry: readonly T[]): T | null {
  if (pantry.length === 0 || !name.trim()) return null;
  const matched = bestPantryMatch(name, pantry);
  const matchId = matched ? matched.ingredientId : slugIngredientId(name);
  const matchName = matched ? matched.name : formatDetectedIngredientName(name);
  for (const row of pantry) {
    if (row.ingredientId === matchId) return row;
    if (areSameIngredientForPantryDedupe(row.name, matchName)) return row;
  }
  return null;
}

/**
 * Whether an incoming item is the same as an existing pantry row (old app: pantryItemsMatch).
 * A specific item satisfies a generic row, not the reverse.
 */
export function pantryItemsMatch(
  existing: Pick<PantryMatchRow, 'ingredientId' | 'name'>,
  incoming: Pick<PantryMatchRow, 'ingredientId' | 'name'>,
): boolean {
  if (existing.ingredientId && incoming.ingredientId && existing.ingredientId === incoming.ingredientId) return true;
  if (normalizeIngredientName(existing.name) === normalizeIngredientName(incoming.name)) return true;
  if (ingredientMatchScore(existing.name, incoming.name) >= 1) return true;
  return fuzzyNameScore(existing.name, incoming.name) >= MERGE_FUZZY_SCORE;
}

/** Units compared as the old app did: trimmed, any case. */
export function sameUnit(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Old app rounding for summed quantities. */
export function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ReceiptMatch<T extends PantryMatchRow> =
  /** Same item, same unit: the quantity is added to this row. */
  | { kind: 'top-up'; row: T }
  /** Same item in another unit: saved as its own row. */
  | { kind: 'other-unit'; row: T }
  | { kind: 'new' };

/** Receipts: what saving this line does to the pantry (old app: mergePantryStock). */
export function matchReceiptLine<T extends PantryMatchRow>(
  line: { name: string; ingredientId: string; unit: string },
  pantry: readonly T[],
): ReceiptMatch<T> {
  if (!line.name.trim()) return { kind: 'new' };
  const matches = pantry.filter((row) => pantryItemsMatch(row, line));
  if (matches.length === 0) return { kind: 'new' };
  const sameUnitRow = matches.find((row) => sameUnit(row.unit, line.unit));
  if (sameUnitRow) return { kind: 'top-up', row: sameUnitRow };
  return { kind: 'other-unit', row: matches[0]! };
}
