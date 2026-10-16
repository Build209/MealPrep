import { favoriteStoreKey } from './kroger';
import type { Store } from './logic';

/**
 * user_favorite_stores rows (live baseline), mapped for the screen. A favourite's app id is its
 * store_key (unique per user), so the optimistic list and the server agree on identity.
 */

export type FavoriteStoreRow = {
  id: string;
  user_id: string;
  store_key: string;
  name: string;
  chain: string;
  address_line: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  kroger_location_id: string | null;
  source: string;
  sort_order: number;
  created_at: string;
};

export type FavoriteStore = {
  /** The store_key. */
  id: string;
  rowId: string | null;
  name: string;
  chain: string;
  sortOrder: number;
  /** Only when the row has one (a Kroger-family store); the weekly-ad link needs it to pick the right chain page. */
  krogerLocationId?: string;
};

export const FAVORITE_STORE_COLUMNS =
  'id, user_id, store_key, name, chain, address_line, city, state, zip, lat, lng, kroger_location_id, source, sort_order, created_at';

export function favoriteFromRow(row: FavoriteStoreRow): FavoriteStore {
  return {
    id: row.store_key,
    rowId: row.id,
    name: row.name,
    chain: row.chain ?? '',
    sortOrder: row.sort_order ?? 0,
    ...(row.kroger_location_id ? { krogerLocationId: row.kroger_location_id } : {}),
  };
}

/** The columns the old app writes for a favourite (mobile/lib/smartShop/profileLocation.ts), new ones last. */
export function favoriteInsertColumns(userId: string, store: Store, sortOrder: number) {
  return {
    user_id: userId,
    store_key: favoriteStoreKey(store),
    name: store.name,
    chain: store.chain,
    address_line: store.addressLine,
    city: store.city,
    state: store.state,
    zip: store.zip,
    lat: store.lat ?? null,
    lng: store.lng ?? null,
    kroger_location_id: store.krogerLocationId ?? null,
    // The old app writes 'osm' for catalog rows and 'kroger' for Kroger-only rows.
    source: store.source === 'kroger' ? 'kroger' : 'osm',
    sort_order: sortOrder,
  };
}

/** The placeholder shown at once while the server saves. */
export function placeholderFavorite(store: Store, sortOrder: number): FavoriteStore {
  return { id: favoriteStoreKey(store), rowId: null, name: store.name, chain: store.chain, sortOrder };
}

export function nextSortOrder(list: readonly FavoriteStore[]): number {
  return list.reduce((max, f) => Math.max(max, f.sortOrder + 1), 0);
}
