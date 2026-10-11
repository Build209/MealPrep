import { isSupabaseConfigured } from '../../config/appConfig';
import { STORE_SEARCH } from '../../config/storeSearch';
import { getSupabase } from '../supabase';
import { roundCoordsForPrivacy } from './geoPrivacy';
import { rowToStoreRecord, selectNearbyCatalogStores, type NearbyStoresRow } from './nearbyCatalogRows';
import {
  readCachedNearbyStores,
  readCachedNearbyStoresStale,
  writeCachedNearbyStores,
} from './storeSearchCache';
import type { StoreRecord } from './types';

export type FetchSupabaseNearbyResult =
  | { ok: true; stores: StoreRecord[]; fromCache?: boolean }
  | { ok: false; reason: 'unconfigured' | 'error' | 'empty' };

export async function fetchNearbyStoresFromSupabase(
  origin: { lat: number; lng: number },
  options: { radiusM: number; limit?: number; cacheOnly?: boolean },
): Promise<FetchSupabaseNearbyResult> {
  const rounded = roundCoordsForPrivacy(origin.lat, origin.lng);
  const radiusM = options.radiusM;
  const limit = options.limit ?? STORE_SEARCH.nearbyRpcLimit;

  const cached = readCachedNearbyStores(rounded, radiusM);
  if (cached?.length) {
    // A fresh cache hit is a normal answer. `fromCache` is reserved for the stale copy served
    // when the server could not be asked (below): the caller shows a "could not reach store
    // search servers" notice for it, which was appearing on every revisit within the cache window.
    return { ok: true, stores: cached };
  }

  if (options.cacheOnly) {
    const stale = readCachedNearbyStoresStale(rounded, radiusM);
    if (stale?.length) return { ok: true, stores: stale, fromCache: true };
    return { ok: false, reason: 'error' };
  }

  if (!isSupabaseConfigured()) return { ok: false, reason: 'unconfigured' };
  const client = getSupabase();
  if (!client) return { ok: false, reason: 'unconfigured' };

  const { data, error } = await client.rpc('nearby_stores', {
    p_lat: rounded.lat,
    p_lng: rounded.lng,
    p_radius_m: radiusM,
    p_limit: limit,
  });

  if (error) {
    return { ok: false, reason: 'error' };
  }

  const rows = (data ?? []) as NearbyStoresRow[];
  if (rows.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const stores = selectNearbyCatalogStores(rows.map(rowToStoreRecord));
  if (stores.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  writeCachedNearbyStores(rounded, radiusM, stores);
  return { ok: true, stores };
}
