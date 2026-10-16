import type { FavoriteStore } from './favorites';
import { favoriteStoreKey } from './kroger';
import { sortStoresByDistanceMiles, storeDisplayName, type SearchOrigin, type Store } from './logic';

/**
 * The row of store circles at the top of the Grocery list (owner request, 2026-10-16): up to 3
 * favourite stores, newest first; any free places are filled with the closest stores (recognised
 * chains first, then local markets), only when a search location is already saved. Pure and
 * tested (tests/stores-row.test.ts).
 */

export const STORE_ROW_SIZE = 3;

export type RowStore = {
  /** The favourite key (favoriteStoreKey): Kroger's id when known, else the listing id. */
  key: string;
  /** The name under the circle: the chain when known, else the listing's name. */
  name: string;
  /** What the badge is drawn from. */
  chain: string;
  kind: 'favorite' | 'nearby';
};

/** A location the shopper chose (device location or their own ZIP), not the app's default ZIP. */
export function hasSavedLocation(origin: SearchOrigin): boolean {
  return origin.kind === 'gps' || !origin.isDefault;
}

/**
 * Favourites for the row: the most recently saved first (a new favourite gets the next sort_order,
 * see nextSortOrder), at most `size`. A 4th favourite stays saved; it just is not in the row.
 */
export function favoritesForRow(favorites: readonly FavoriteStore[], size: number = STORE_ROW_SIZE): FavoriteStore[] {
  return favorites
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.sortOrder - a.f.sortOrder || a.i - b.i)
    .map(({ f }) => f)
    .slice(0, Math.max(0, size));
}

function chainKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Favourites first (newest first), then the closest stores to fill the row. No store twice (by
 * favourite key), and a nearby store is skipped when the row already shows that chain (a favourite
 * Safeway across town and the nearest Safeway would look like the same circle twice). At most `size`.
 */
export function pickRowStores(input: {
  favorites: readonly FavoriteStore[];
  chains?: readonly Store[];
  local?: readonly Store[];
  size?: number;
}): RowStore[] {
  const size = Math.max(0, input.size ?? STORE_ROW_SIZE);
  const out: RowStore[] = [];
  const keys = new Set<string>();
  const chainsShown = new Set<string>();

  for (const f of favoritesForRow(input.favorites, size)) {
    if (keys.has(f.id)) continue;
    const name = f.chain || f.name;
    out.push({ key: f.id, name, chain: name, kind: 'favorite' });
    keys.add(f.id);
    chainsShown.add(chainKey(name));
  }

  const nearby = [...sortStoresByDistanceMiles(input.chains ?? []), ...sortStoresByDistanceMiles(input.local ?? [])];
  for (const store of nearby) {
    if (out.length >= size) break;
    const key = favoriteStoreKey(store);
    const name = storeDisplayName(store);
    if (keys.has(key) || chainsShown.has(chainKey(name))) continue;
    out.push({ key, name, chain: name, kind: 'nearby' });
    keys.add(key);
    chainsShown.add(chainKey(name));
  }
  return out.slice(0, size);
}

/** Show the "Find stores" circle: the row has room and no nearby stores are coming to fill it. */
export function showFindStores(picked: number, locationSaved: boolean, nearbyLoading: boolean, size: number = STORE_ROW_SIZE): boolean {
  if (picked >= size) return false;
  if (locationSaved && nearbyLoading) return false;
  return true;
}
