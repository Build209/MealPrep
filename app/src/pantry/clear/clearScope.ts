import {
  normalizePantryStorageLocation,
  PANTRY_STORAGE_LOCATION_LABELS,
  PANTRY_STORAGE_LOCATIONS,
  type PantryStorageLocation,
} from '../../kitchen/storage';

/**
 * "Clear items" on the Pantry tab: which rows a choice covers, the counts on the menu, and
 * the words. Pure (no React, no network), tested in tests/pantry-clear.test.ts.
 *
 * A row's place is read the same way the shelves and list read it (normalizePantryStorageLocation),
 * so an old "Refrigerator" row counts as Fridge and an empty one as Pantry: what the person sees
 * under a place is exactly what clearing that place removes.
 */

export type ClearScope = 'all' | PantryStorageLocation;

/** Menu order: everything first, then the places in the app's usual order. */
export const CLEAR_SCOPES: readonly ClearScope[] = ['all', ...PANTRY_STORAGE_LOCATIONS];

type Placed = { id: string; location: string | null };

export function rowsInScope<T extends Placed>(items: readonly T[], scope: ClearScope): T[] {
  if (scope === 'all') return [...items];
  return items.filter((item) => normalizePantryStorageLocation(item.location) === scope);
}

export function idsInScope(items: readonly Placed[], scope: ClearScope): string[] {
  return rowsInScope(items, scope).map((item) => item.id);
}

export function clearCounts(items: readonly Placed[]): Record<ClearScope, number> {
  const counts: Record<ClearScope, number> = { all: items.length, pantry: 0, fridge: 0, spice_rack: 0 };
  for (const item of items) counts[normalizePantryStorageLocation(item.location)] += 1;
  return counts;
}

function itemsWord(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

/** "All items", "Pantry", "Fridge", "Spice rack". */
export function scopeLabel(scope: ClearScope): string {
  return scope === 'all' ? CLEAR_COPY.allItems : PANTRY_STORAGE_LOCATION_LABELS[scope];
}

export const CLEAR_COPY = {
  open: 'Clear items',
  openA11y: 'Clear items: choose all items or one place',
  menuTitle: 'Clear items',
  menuBody: 'Choose what to remove. You will be asked to confirm, and you can undo it right after.',
  allItems: 'All items',
  /** Visible count under each menu choice. */
  count: (count: number) => itemsWord(count),
  /** What a screen reader hears for a menu choice, count included. */
  optionA11y: (scope: ClearScope, count: number) =>
    count === 0 ? `${scopeLabel(scope)}, no items` : `${scopeLabel(scope)}, ${itemsWord(count)}`,
  confirmTitle: (scope: ClearScope, count: number) => {
    if (scope === 'all') return count === 1 ? 'Remove your 1 item?' : `Remove all ${count} items?`;
    const place = PANTRY_STORAGE_LOCATION_LABELS[scope];
    return count === 1 ? `Remove the 1 item in the ${place}?` : `Remove all ${count} items from the ${place}?`;
  },
  confirmBody: (scope: ClearScope) =>
    scope === 'all'
      ? 'This empties the Pantry, the Fridge and the Spice rack. You can undo it for a few seconds afterwards.'
      : 'Other places are not touched. You can undo it for a few seconds afterwards.',
  confirmAction: (count: number) => `Remove ${itemsWord(count)}`,
  working: 'Removing…',
  cancel: 'Cancel',
  back: 'Back',
  removed: (scope: ClearScope, count: number) =>
    scope === 'all'
      ? `Removed ${itemsWord(count)}.`
      : `Removed ${itemsWord(count)} from the ${PANTRY_STORAGE_LOCATION_LABELS[scope]}.`,
  partlyRemoved: (count: number, message: string) => `Only ${itemsWord(count)} removed. ${message}`,
  restored: (count: number) => (count === 1 ? '1 item is back.' : `${count} items are back.`),
  failed: (message: string) => `Not removed. ${message}`,
  undoFailed: (message: string) => `Couldn't put them back. ${message}`,
} as const;
