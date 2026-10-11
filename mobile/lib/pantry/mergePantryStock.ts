import { suggestStorageLocationForPantryItem } from '../../config/pantryStorage';
import type { GroceryListItem, PantryCategory, PantryItem } from '../../types/mealprep';
import {
  fuzzyNameScore,
  ingredientMatchScore,
  normalizeIngredientName,
} from '../recipeMatch/ingredientNormalize';
import { convertIngredientQuantity, ingredientUnitsConvertible } from '../units/ingredientUnitBridge';
import { isPersistedRowUuid } from './persistIds';

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Whether `incoming` should merge into an existing pantry row (specific satisfies generic, not reverse). */
export function pantryItemsMatch(existing: PantryItem, incoming: PantryItem): boolean {
  if (existing.ingredientId && incoming.ingredientId && existing.ingredientId === incoming.ingredientId) {
    return true;
  }
  if (normalizeIngredientName(existing.name) === normalizeIngredientName(incoming.name)) return true;
  if (ingredientMatchScore(existing.name, incoming.name) >= 1) return true;
  return fuzzyNameScore(existing.name, incoming.name) >= 0.92;
}

export function mergePantryQuantities(existing: PantryItem, incoming: PantryItem): PantryItem {
  const sameUnit = existing.unit.toLowerCase() === incoming.unit.toLowerCase();
  let quantity: number;
  if (sameUnit) {
    quantity = roundQty(existing.quantity + incoming.quantity);
  } else if (
    ingredientUnitsConvertible(existing.name, existing.unit, incoming.unit) ||
    ingredientUnitsConvertible(incoming.name, incoming.unit, existing.unit)
  ) {
    const converted = convertIngredientQuantity(
      incoming.quantity,
      incoming.unit,
      existing.unit,
      incoming.name || existing.name,
    );
    quantity =
      converted === null
        ? Math.max(existing.quantity, incoming.quantity)
        : roundQty(existing.quantity + converted);
  } else {
    quantity = Math.max(existing.quantity, incoming.quantity);
  }
  return {
    ...existing,
    quantity,
    category: incoming.category ?? existing.category,
    location: existing.location,
    scanPhotoPath: incoming.scanPhotoPath ?? existing.scanPhotoPath,
    photoUri: incoming.photoUri ?? existing.photoUri,
    expiresOn: incoming.expiresOn ?? existing.expiresOn,
    updatedAt: incoming.updatedAt,
  };
}

export interface MergePantryStockResult {
  pantry: PantryItem[];
  /** New rows added (not merged into an existing id). */
  inserted: PantryItem[];
  /** Existing rows whose quantity or metadata changed. */
  updated: PantryItem[];
}

/**
 * Merge incoming pantry rows into a list using ingredient identity rules
 * (specific satisfies generic; generic does not satisfy specific).
 */
/**
 * After a signed-in kitchen fetch, server rows win. The only local rows kept are ones the server
 * has never seen: rows still carrying a local id ("manual-…", "scan-…") and rows named in
 * `pendingIds` (a save in flight under an id the client chose). Quantities are never summed.
 *
 * A local row with a saved (uuid) id that the server no longer returns was deleted, here or on
 * another device. It must not come back: the copy of the kitchen kept on the device used to
 * bring a cleared pantry back to life on the next open.
 */
export function reconcilePantryAfterServerLoad(
  serverPantry: PantryItem[],
  previousLocal: PantryItem[],
  options?: { pendingIds?: ReadonlySet<string> },
): PantryItem[] {
  const serverIds = new Set(serverPantry.map((row) => row.id));
  const pendingLocalOnly = previousLocal.filter((row) => {
    if (serverIds.has(row.id)) return false;
    if (isPersistedRowUuid(row.id) && !options?.pendingIds?.has(row.id)) return false;
    if (serverPantry.some((serverRow) => pantryItemsMatch(serverRow, row))) return false;
    return true;
  });
  return [...serverPantry, ...pendingLocalOnly];
}

/**
 * What to send to the server to turn the saved pantry `before` into `after`, comparing rows by
 * id: rows only in `after` are inserts, rows in both whose stock changed are updates, rows only
 * in `before` are deletes. One computation feeds both the screen and the server, so the two can
 * never disagree about which row is which.
 */
export function diffPantryForServer(
  before: readonly PantryItem[],
  after: readonly PantryItem[],
): { inserted: PantryItem[]; updated: PantryItem[]; removedIds: string[] } {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterIds = new Set(after.map((row) => row.id));
  const inserted: PantryItem[] = [];
  const updated: PantryItem[] = [];
  for (const row of after) {
    const prior = beforeById.get(row.id);
    if (!prior) {
      inserted.push(row);
      continue;
    }
    if (
      prior.quantity !== row.quantity ||
      prior.unit !== row.unit ||
      prior.name !== row.name ||
      prior.location !== row.location ||
      prior.category !== row.category ||
      (prior.expiresOn ?? null) !== (row.expiresOn ?? null)
    ) {
      updated.push(row);
    }
  }
  const removedIds = before.filter((row) => !afterIds.has(row.id)).map((row) => row.id);
  return { inserted, updated, removedIds };
}

/** Swap rows for their saved copies (same id), keeping every other row and the order. */
export function replacePantryRowsById(pantry: PantryItem[], saved: readonly PantryItem[]): PantryItem[] {
  if (saved.length === 0) return pantry;
  const savedById = new Map(saved.map((row) => [row.id, row]));
  return pantry.map((row) => savedById.get(row.id) ?? row);
}

export function mergePantryStock(
  accountPantry: PantryItem[],
  incoming: PantryItem[],
): MergePantryStockResult {
  if (incoming.length === 0) {
    return { pantry: accountPantry, inserted: [], updated: [] };
  }

  const merged = accountPantry.map((row) => ({ ...row }));
  const inserted: PantryItem[] = [];
  const updated: PantryItem[] = [];
  const accountIds = new Set(accountPantry.map((row) => row.id));

  for (const row of incoming) {
    const index = merged.findIndex((existing) => pantryItemsMatch(existing, row));
    if (index < 0) {
      merged.unshift(row);
      inserted.push(row);
      continue;
    }
    const combined = mergePantryQuantities(merged[index], row);
    if (
      combined.quantity !== merged[index].quantity ||
      combined.updatedAt !== merged[index].updatedAt
    ) {
      merged[index] = combined;
      if (accountIds.has(combined.id)) {
        updated.push(combined);
      }
    }
  }

  return { pantry: merged, inserted, updated };
}

function newPantryRowId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14)}${Math.random().toString(16).slice(2, 6)}`;
}

export function groceryItemToPantryItem(item: GroceryListItem, now = new Date().toISOString()): PantryItem {
  const slug = item.name.toLowerCase().replace(/\s+/g, '-');
  const category = item.category as PantryCategory;
  return {
    id: newPantryRowId(),
    ingredientId: `grocery-${slug}`,
    name: item.name.trim(),
    category,
    quantity: item.quantity,
    unit: item.unit.trim() || 'each',
    location: suggestStorageLocationForPantryItem(item.name, category),
    photoUri: null,
    expiresOn: null,
    updatedAt: now,
  };
}

export function groceryItemsToPantryItems(items: GroceryListItem[]): PantryItem[] {
  const stamp = Date.now();
  return items.map((item, index) =>
    groceryItemToPantryItem(item, new Date(stamp + index).toISOString()),
  );
}
