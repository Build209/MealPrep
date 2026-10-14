import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { env } from '../lib/env';
import { favoriteStoreKey, krogerLocationsBody, mergeKrogerLocations, parseKrogerLocations, type KrogerLocationRow } from '../stores/kroger';
import {
  FAVORITE_STORE_COLUMNS,
  favoriteFromRow,
  favoriteInsertColumns,
  nextSortOrder,
  placeholderFavorite,
  type FavoriteStore,
  type FavoriteStoreRow,
} from '../stores/favorites';
import {
  nearbyStoreSearchRadiusMeters,
  roundCoordsForPrivacy,
  rowToStore,
  selectNearbyCatalogStores,
  sortAndLimitStoresForStoresTab,
  STORES,
  type NearbyStoresRow,
  type SearchOrigin,
  type Store,
  type StoresList,
} from '../stores/logic';
import { geocodeUsZip, type GeocodedPoint } from '../stores/zipGeocode';
import { DataError, offlineError, retryUnlessPermanent, run, toDataError } from './errors';
import { keys, SIGNED_OUT } from './keys';
import { isOnlineNow } from './online';
import { addItem, removeItem } from './listOps';
import { listMutation } from './optimistic';
import { PROFILE_COLUMNS, profileFromRow, type Profile, type ProfileRow } from './rows';
import { requireClient, requireUserId, useSessionUserId } from './session';

/**
 * Stores tab data: nearby stores (public `stores` via the nearby_stores function), Kroger-family
 * locations (live kroger-deals function, same request as the old app), the shopper's favourite
 * stores (user_favorite_stores) and the saved search location (profiles.home_zip / home_lat / home_lng).
 * Same rules as the rest of the data layer (README.md): the query cache is the only copy.
 */

export const storesKeys = {
  all: ['stores'] as const,
  zip: (zip: string) => ['stores', 'zip', zip] as const,
  nearby: (lat: number, lng: number, radiusM: number) => ['stores', 'nearby', String(lat), String(lng), String(radiusM)] as const,
  kroger: (lat: number, lng: number) => ['stores', 'kroger', String(lat), String(lng)] as const,
  favorites: (userId: string | null | undefined) => ['stores', userId ? userId : SIGNED_OUT, 'favorites'] as const,
} as const;

export const storesMutationKeys = {
  favorites: ['stores', 'favorites'] as const,
  location: ['stores', 'location'] as const,
} as const;

// ----------------------------------------------------------------------- reads

/** nearby_stores with rounded coordinates, then the old app's name filter and per-group trim. */
export async function fetchNearbyStores(origin: { lat: number; lng: number }, radiusM: number): Promise<Store[]> {
  const client = requireClient();
  const rounded = roundCoordsForPrivacy(origin.lat, origin.lng);
  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc('nearby_stores', { p_lat: rounded.lat, p_lng: rounded.lng, p_radius_m: radiusM, p_limit: STORES.rpcLimit });
  } catch (thrown) {
    throw toDataError(thrown);
  }
  if (response.error) throw toDataError(response.error);
  const rows = (Array.isArray(response.data) ? response.data : []) as NearbyStoresRow[];
  return selectNearbyCatalogStores(rows.map(rowToStore));
}

export type KrogerAnswer = { rows: KrogerLocationRow[]; configured: boolean; failed: boolean };

/**
 * Kroger-family stores near the origin, from the live kroger-deals function ("locations"), with the
 * public key as the old app sends it. Any failure means "no Kroger rows": the list still shows.
 */
export async function fetchKrogerLocations(origin: { lat: number; lng: number }, zip: string | undefined): Promise<KrogerAnswer> {
  const base = env.supabaseUrl.trim().replace(/\/$/, '');
  if (!base) return { rows: [], configured: false, failed: false };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const anon = env.supabaseAnonKey.trim();
  if (anon) headers.Authorization = `Bearer ${anon}`;
  try {
    const res = await fetch(`${base}/functions/v1/kroger-deals`, {
      method: 'POST',
      headers,
      body: JSON.stringify(krogerLocationsBody(origin, zip)),
    });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    const parsed = parseKrogerLocations(res.status, payload);
    return { ...parsed, failed: false };
  } catch {
    return { rows: [], configured: false, failed: true };
  }
}

/** Where to search from, as a point. A ZIP is looked up in the built-in tables (no live service). */
function useOriginPoint(origin: SearchOrigin) {
  const zip = origin.kind === 'zip' ? origin.zip : '';
  const geocode = useQuery({
    queryKey: storesKeys.zip(zip),
    queryFn: async (): Promise<GeocodedPoint> => {
      const result = await geocodeUsZip(zip);
      if (!result.ok) {
        throw new DataError(result.reason === 'network' ? 'network' : 'invalid', result.reason === 'network' ? ZIP_LOOKUP_FAILED : ZIP_NOT_FOUND);
      }
      return result.point;
    },
    enabled: origin.kind === 'zip',
    staleTime: Infinity,
    retry: retryUnlessPermanent,
  });
  if (origin.kind === 'gps') return { point: { lat: origin.lat, lng: origin.lng } as GeocodedPoint, geocode: null };
  return { point: geocode.data ?? null, geocode };
}

export const ZIP_NOT_FOUND = 'Could not find that ZIP code. Check and try again.';
export const ZIP_LOOKUP_FAILED = 'Could not look up that ZIP. Try again.';

/**
 * The Stores tab list: chains first, then local markets, each closest first. Kroger rows are
 * merged when they arrive and are kept in memory for 10 minutes at most (never stored).
 */
export function useNearbyStoresList(origin: SearchOrigin, radiusMultiplier: 1 | 2) {
  const { point, geocode } = useOriginPoint(origin);
  const radiusM = nearbyStoreSearchRadiusMeters({ isGpsOrigin: origin.kind === 'gps', radiusMultiplier });
  const rounded = point ? roundCoordsForPrivacy(point.lat, point.lng) : null;
  const rLat = rounded?.lat ?? null;
  const rLng = rounded?.lng ?? null;
  const pLat = point?.lat ?? null;
  const pLng = point?.lng ?? null;

  const nearby = useQuery({
    queryKey: storesKeys.nearby(rounded?.lat ?? 0, rounded?.lng ?? 0, radiusM),
    queryFn: () => fetchNearbyStores(rounded!, radiusM),
    enabled: rounded != null,
    staleTime: 5 * 60_000,
    retry: retryUnlessPermanent,
  });

  const kroger = useQuery({
    queryKey: storesKeys.kroger(rounded?.lat ?? 0, rounded?.lng ?? 0),
    queryFn: () => fetchKrogerLocations(rounded!, origin.kind === 'zip' ? origin.zip : undefined),
    enabled: rounded != null,
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const list: StoresList = useMemo(() => {
    if (rLat == null || rLng == null || pLat == null || pLng == null || !nearby.data) return { chains: [], local: [] };
    const merged = mergeKrogerLocations(nearby.data, kroger.data?.rows ?? []);
    // Distances are measured from the search point itself (as before); only the request is rounded.
    return sortAndLimitStoresForStoresTab(merged, { lat: pLat, lng: pLng });
  }, [nearby.data, kroger.data, rLat, rLng, pLat, pLng]);

  return {
    point,
    list,
    geocodeError: geocode?.error ?? null,
    isPending: (geocode?.isPending ?? false) || (rounded != null && nearby.isPending),
    isError: nearby.isError,
    error: nearby.error,
    refetch: () => void nearby.refetch(),
  };
}

// ------------------------------------------------------------------ favourites

export async function fetchFavoriteStores(userId: string | null | undefined): Promise<FavoriteStore[]> {
  const client = requireClient();
  const owner = requireUserId(userId);
  const rows = await run<FavoriteStoreRow[]>(
    client.from('user_favorite_stores').select(FAVORITE_STORE_COLUMNS).eq('user_id', owner).order('sort_order', { ascending: true }),
  );
  return rows.map(favoriteFromRow);
}

export function useFavoriteStores() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: storesKeys.favorites(userId),
    queryFn: () => fetchFavoriteStores(userId),
    enabled: !session.isPending,
    retry: retryUnlessPermanent,
  });
}

export type ToggleFavoriteVars = { store: Store; favorite: boolean; sortOrder: number };

async function saveFavorite(userId: string | null | undefined, vars: ToggleFavoriteVars): Promise<FavoriteStore | null> {
  const client = requireClient();
  const owner = requireUserId(userId);
  const storeKey = favoriteStoreKey(vars.store);
  if (vars.favorite) {
    const row = await run<FavoriteStoreRow>(
      client
        .from('user_favorite_stores')
        .upsert(favoriteInsertColumns(owner, vars.store, vars.sortOrder), { onConflict: 'user_id,store_key' })
        .select(FAVORITE_STORE_COLUMNS)
        .single(),
    );
    return favoriteFromRow(row);
  }
  let response: { error: unknown };
  try {
    response = await client.from('user_favorite_stores').delete().eq('user_id', owner).eq('store_key', storeKey);
  } catch (thrown) {
    throw toDataError(thrown);
  }
  if (response.error) throw toDataError(response.error);
  return null;
}

/** Save or unsave a store: shown at once, rolled back if the server refuses, then refetched. */
export function useToggleFavoriteStore() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useMutation({
    mutationKey: storesMutationKeys.favorites,
    mutationFn: (vars: ToggleFavoriteVars) => saveFavorite(userId, vars),
    ...listMutation<FavoriteStore, ToggleFavoriteVars, FavoriteStore | null>({
      queryClient,
      queryKey: storesKeys.favorites(userId),
      mutationKey: storesMutationKeys.favorites,
      change: (vars) =>
        vars.favorite ? addItem(placeholderFavorite(vars.store, vars.sortOrder)) : removeItem<FavoriteStore>(favoriteStoreKey(vars.store)),
      isOnline: isOnlineNow,
    }),
  });
}

export { nextSortOrder };

// -------------------------------------------------------------------- location

export type SaveLocationVars = { kind: 'gps'; lat: number; lng: number } | { kind: 'zip'; zip: string };

/**
 * Saves the search location on the profile, as the old app does: rounded coordinates for "Use my
 * location", or the ZIP (which clears saved coordinates). Precise location is never sent.
 */
export async function saveHomeLocation(userId: string | null | undefined, vars: SaveLocationVars): Promise<Profile> {
  const client = requireClient();
  const owner = requireUserId(userId);
  const patch: Record<string, string | number | null> = { home_location_updated_at: new Date().toISOString() };
  if (vars.kind === 'gps') {
    const rounded = roundCoordsForPrivacy(vars.lat, vars.lng);
    patch.home_lat = rounded.lat;
    patch.home_lng = rounded.lng;
  } else {
    patch.home_zip = vars.zip.trim().slice(0, 10);
    patch.home_lat = null;
    patch.home_lng = null;
  }
  const row = await run<ProfileRow>(client.from('profiles').update(patch).eq('id', owner).select(PROFILE_COLUMNS).single());
  return profileFromRow(row);
}

export function useSaveHomeLocation() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useMutation({
    mutationKey: storesMutationKeys.location,
    mutationFn: async (vars: SaveLocationVars) => {
      if (!isOnlineNow()) throw offlineError();
      return saveHomeLocation(userId, vars);
    },
    onSuccess: (profile) => queryClient.setQueryData(keys.profile.own(userId), profile),
  });
}
