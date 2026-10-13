/**
 * Which pantry row a ticked grocery item adds to. The old app did this on its local copy
 * (mobile/lib/grocery/restockLedger.ts, mobile/lib/pantry/mergePantryStock.ts), which is how
 * stock got added or taken out twice. Now the server does the adding, in one step
 * (public.tick_grocery_item); this only picks the row the screen means, as a hint. The server
 * checks the hint (same owner, same unit) and otherwise matches by name and unit itself.
 *
 * The rule: same normalised ingredient name AND same unit (case and spaces ignored). Different
 * units never merge here (a head of garlic is not a clove), so nothing is converted.
 */
import { normalizeIngredientName } from './ingredientNormalize';
import { suggestStorageLocationForPantryItem, type PantryStorageLocation } from './storage';
import { normalizePantryCategory } from './categories';

export type RestockPantryRow = { id: string; name: string; unit: string; updatedAt?: string };
export type RestockGroceryRow = { name: string; unit: string; category: string };

export function sameUnit(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The pantry row a ticked item should add to, or null for "make a new row". When several
 * rows match, the most recently updated wins (then the lowest id, so the answer is stable).
 * Rows with a temporary id (not saved yet) are skipped.
 */
export function findPantryRowForGrocery<P extends RestockPantryRow>(
  pantry: readonly P[],
  item: RestockGroceryRow,
): P | null {
  const key = normalizeIngredientName(item.name);
  if (!key) return null;
  const matches = pantry.filter(
    (row) => !row.id.startsWith('temp-') && sameUnit(row.unit, item.unit) && normalizeIngredientName(row.name) === key,
  );
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    const byTime = (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  })[0]!;
}

/** Where a new pantry row from a ticked item is kept (same rule as the pantry add sheet). */
export function pantryPlaceForGrocery(item: RestockGroceryRow): PantryStorageLocation {
  return suggestStorageLocationForPantryItem(item.name, normalizePantryCategory(item.category));
}
