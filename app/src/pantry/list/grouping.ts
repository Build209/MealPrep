import { daysUntilPantryExpiry, formatPantryDaysLeft } from '../../kitchen/expiry';
import { formatQuantityWithUnit } from '../../kitchen/formatQuantity';
import { labelForPantryStorageLocation, type PantryStorageLocation } from '../../kitchen/storage';
import { SHELF_PLACES, SHELF_USE_SOON_DAYS, shelfDaysBadge } from '../shelves/packages';
import type { ShelvedItem } from '../types';

/**
 * The list view: a "Use soon" group first (the old app's rule: a use-by date within
 * SHELF_USE_SOON_DAYS days, or already past it; soonest first), then one group per place
 * in shelf order (Fridge, Pantry, Spice rack), each sorted by name. Every item is listed once:
 * an item in "Use soon" is not repeated under its place. Empty groups are left out.
 */

export type PantryListGroup = {
  id: 'use-soon' | PantryStorageLocation;
  title: string;
  items: ShelvedItem[];
};

export const PANTRY_LIST_COPY = {
  useSoon: 'Use soon',
  pastDate: 'Past its date',
} as const;

function byName(a: ShelvedItem, b: ShelvedItem): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function isUseSoon(item: Pick<ShelvedItem, 'expiresOn'>, now = new Date()): boolean {
  return shelfDaysBadge(item, now) !== null;
}

export function groupPantryForList(items: readonly ShelvedItem[], now = new Date()): PantryListGroup[] {
  const soon = items
    .filter((item) => isUseSoon(item, now))
    .sort((a, b) => {
      const byDays = (daysUntilPantryExpiry(a, now) ?? 0) - (daysUntilPantryExpiry(b, now) ?? 0);
      return byDays !== 0 ? byDays : byName(a, b);
    });
  const rest = items.filter((item) => !isUseSoon(item, now));

  const groups: PantryListGroup[] = [];
  if (soon.length > 0) groups.push({ id: 'use-soon', title: PANTRY_LIST_COPY.useSoon, items: soon });
  for (const place of SHELF_PLACES) {
    const here = rest.filter((item) => item.location === place).sort(byName);
    if (here.length > 0) groups.push({ id: place, title: labelForPantryStorageLocation(place), items: here });
  }
  return groups;
}

/** "2 cup", or the date note for a dated item: "2 cup · 3 days left", "1 each · Past its date". */
export function pantryRowDetail(item: Pick<ShelvedItem, 'quantity' | 'unit' | 'expiresOn'>, now = new Date()): string {
  const amount = formatQuantityWithUnit(item.quantity, item.unit);
  const days = daysUntilPantryExpiry(item, now);
  if (days === null || days > SHELF_USE_SOON_DAYS) return amount;
  const note = days < 0 ? PANTRY_LIST_COPY.pastDate : formatPantryDaysLeft(item, now);
  return note ? `${amount} · ${note}` : amount;
}

/** The accessible name of a row: name, amount and date note, then where it is kept. */
export function pantryRowLabel(item: ShelvedItem, now = new Date()): string {
  return `${item.name}, ${pantryRowDetail(item, now)}, ${labelForPantryStorageLocation(item.location)}`;
}
