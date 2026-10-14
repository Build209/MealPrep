import { matchesGroceryNameExcludePattern, resolveGroceryChainFromHaystack } from './chains';

/**
 * The Stores tab's rules, pure and tested (tests/stores-*.test.ts). Ported from the old app:
 * mobile/lib/stores/nearbyCatalogRows.ts, storeRecognition.ts, catalogStoreFilter.ts,
 * storesNearbyPipeline.ts, storeDistance.ts, formatAddress.ts, storeSearchRadius.ts, geoPrivacy.ts,
 * mobile/config/storesTab.ts and storeSearch.ts.
 */

export const STORES = {
  /** Rows asked of nearby_stores (the function caps at 200): the nearest 40 in a town are mostly unbranded. */
  rpcLimit: 200,
  /** After the name filter, keep this many nearest recognised stores and this many nearest others. */
  keepPerGroup: 30,
  /** Recognised chains shown (closest first). */
  displayLimit: 15,
  /** Unbranded stores behind "More local markets" (closest first). */
  localLimit: 15,
  /** Search radius from a ZIP, in metres. */
  zipRadiusM: 24_000,
  /** Search radius from the device's location, in metres. */
  gpsRadiusM: 16_000,
  /** Used when the profile has no location yet (Oakdale, the old app's default). */
  defaultZip: '95361',
  /** Kroger location rows within this distance of a listing are the same store (miles). */
  krogerMergeRadiusMiles: 0.35,
  /** Radius sent to kroger-deals (the old app's default, in miles). */
  krogerRadiusMiles: 10,
} as const;

/** A nearby_stores row, exactly as the function returns it. */
export type NearbyStoresRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  address_line: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  opening_hours: string | null;
  sources: string[] | null;
  distance_m: number;
};

export type StoreSource = 'catalog' | 'kroger';

export type Store = {
  id: string;
  name: string;
  /** The chain's display name when recognised, else the row's brand, else its name. */
  chain: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  distanceMiles?: number;
  source: StoreSource;
  pricingSource: 'kroger' | 'none';
  krogerLocationId?: string;
  website?: string;
  /** The row carries a brand or matches a known grocery chain. */
  knownBrand?: boolean;
};

export function rowToStore(row: NearbyStoresRow): Store {
  const haystack = `${row.name} ${row.brand ?? ''}`.toLowerCase();
  const known = resolveGroceryChainFromHaystack(haystack);
  const chain = known?.displayName ?? (row.brand?.trim() || row.name);
  return {
    id: row.id,
    name: row.name,
    chain,
    addressLine: row.address_line ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    zip: row.zip ?? '',
    lat: row.lat,
    lng: row.lng,
    distanceMiles: Math.round((row.distance_m / 1609.344) * 100) / 100,
    source: 'catalog',
    pricingSource: 'none',
    website: row.website?.trim() || undefined,
    knownBrand: Boolean(known) || Boolean(row.brand?.trim()),
  };
}

// ----------------------------------------------------------------- recognition

/**
 * Recognised chains and brands are listed first; unbranded rows sit behind "More local markets".
 * The open data labels farms, wholesalers and closed businesses as grocery stores, and those rows
 * almost never carry a brand.
 */
export function isRecognizedStore(store: Pick<Store, 'name' | 'chain' | 'knownBrand' | 'krogerLocationId' | 'source'>): boolean {
  if (store.knownBrand) return true;
  // Kroger rows come from Kroger's own location list.
  if (store.krogerLocationId || store.source === 'kroger') return true;
  return resolveGroceryChainFromHaystack(`${store.name} ${store.chain}`.toLowerCase()) != null;
}

export function splitStoresByRecognition<T extends Pick<Store, 'name' | 'chain' | 'knownBrand' | 'krogerLocationId' | 'source'>>(
  stores: readonly T[],
): { recognized: T[]; local: T[] } {
  const recognized: T[] = [];
  const local: T[] = [];
  for (const store of stores) (isRecognizedStore(store) ? recognized : local).push(store);
  return { recognized, local };
}

/** Name filter: known grocery chains always pass, otherwise blocklisted names are dropped. */
export function isNearbyListStoreNameAllowed(name: string, chain?: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const haystack = `${trimmed} ${chain ?? ''}`.trim().toLowerCase();
  if (resolveGroceryChainFromHaystack(haystack)) return true;
  return !matchesGroceryNameExcludePattern(haystack);
}

/**
 * Rows arrive nearest first. Drop blocklisted names, then keep the nearest recognised stores and
 * the nearest others separately, so a cluster of unbranded listings cannot push every supermarket out.
 */
export function selectNearbyCatalogStores(stores: readonly Store[], keepPerGroup: number = STORES.keepPerGroup): Store[] {
  const allowed = stores.filter((s) => isNearbyListStoreNameAllowed(s.name, s.chain));
  const { recognized, local } = splitStoresByRecognition(allowed);
  const kept = new Set([...recognized.slice(0, keepPerGroup), ...local.slice(0, keepPerGroup)]);
  return allowed.filter((s) => kept.has(s));
}

// -------------------------------------------------------------------- distance

type Point = { lat: number; lng: number };

export function haversineMiles(a: Point, b: Point): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function roundDistanceMiles(miles: number): number {
  return Math.round(miles * 10) / 10;
}

/** "1.2 mi" (one decimal, always). */
export function formatDistanceMiles(miles: number): string {
  return `${roundDistanceMiles(miles).toFixed(1)} mi`;
}

export function withDistancesFromOrigin<T extends Pick<Store, 'lat' | 'lng' | 'distanceMiles'>>(stores: readonly T[], origin: Point): T[] {
  return stores.map((s) =>
    s.lat == null || s.lng == null ? s : { ...s, distanceMiles: roundDistanceMiles(haversineMiles(origin, { lat: s.lat, lng: s.lng })) },
  );
}

/** Closest first; unknown distance last; name breaks ties. */
export function sortStoresByDistanceMiles<T extends Pick<Store, 'distanceMiles' | 'name'>>(stores: readonly T[]): T[] {
  return [...stores].sort((a, b) => {
    const da = a.distanceMiles ?? 9999;
    const db = b.distanceMiles ?? 9999;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });
}

export type StoresList = { chains: Store[]; local: Store[] };

/**
 * The Stores tab order: recognised chains and brands first (closest first, up to displayLimit),
 * then unbranded local markets (closest first, up to localLimit). No favourites boost (as before).
 */
export function sortAndLimitStoresForStoresTab(
  stores: readonly Store[],
  origin: Point,
  displayLimit: number = STORES.displayLimit,
  localLimit: number = STORES.localLimit,
): StoresList {
  const allowed = stores.filter((s) => isNearbyListStoreNameAllowed(s.name, s.chain));
  const sorted = sortStoresByDistanceMiles(withDistancesFromOrigin(allowed, origin));
  const { recognized, local } = splitStoresByRecognition(sorted);
  return { chains: recognized.slice(0, displayLimit), local: local.slice(0, Math.max(0, localLimit)) };
}

/** The search box: matches name, chain, town or street in both groups. */
export function filterStoresList(list: StoresList, query: string): StoresList {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const matches = (s: Store) => `${s.chain} ${s.name} ${s.city} ${s.addressLine}`.toLowerCase().includes(q);
  return { chains: list.chains.filter(matches), local: list.local.filter(matches) };
}

// --------------------------------------------------------------------- address

const PLACEHOLDER_STREET = /^address not listed$/i;

/** Street when known ("12 Main St, Oakdale CA 95361"), otherwise town and ZIP. */
export function formatStoreAddress(store: Pick<Store, 'addressLine' | 'city' | 'state' | 'zip'>): string {
  const street = store.addressLine?.trim();
  if (street && !PLACEHOLDER_STREET.test(street)) {
    const cityLine = [store.city, store.state].filter(Boolean).join(' ');
    const zipSuffix = store.zip ? ` ${store.zip}` : '';
    if (cityLine) return `${street}, ${cityLine}${zipSuffix}`;
    return `${street}${zipSuffix}`.trim();
  }
  const place = [store.city, store.state].filter(Boolean).join(', ');
  if (place && store.zip) return `${place} ${store.zip}`;
  if (store.zip) return store.zip.trim();
  return place;
}

/** The name on the card: the chain's name when known, else the listing's name. */
export function storeDisplayName(store: Pick<Store, 'chain' | 'name'>): string {
  return store.chain || store.name;
}

// ------------------------------------------------------------ location, privacy

/** Round coordinates before they are sent or saved (2 decimals, about half a mile). Never raw GPS. */
export function roundCoordsForPrivacy(lat: number, lng: number): Point {
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

export function isValidUsZip(zip: unknown): boolean {
  return typeof zip === 'string' && /^\d{5}(-\d{4})?$/.test(zip.trim());
}

/** Search radius in metres: tighter from the device's location; "Try a wider area" doubles it. */
export function nearbyStoreSearchRadiusMeters(options: { isGpsOrigin?: boolean; radiusMultiplier?: 1 | 2 }): number {
  const base = options.isGpsOrigin ? STORES.gpsRadiusM : STORES.zipRadiusM;
  return base * (options.radiusMultiplier === 2 ? 2 : 1);
}

/** Where the list is searched from, as saved on the profile. */
export type ProfileLocation = { homeZip: string | null; homeLat: number | null; homeLng: number | null };

export type SearchOrigin =
  | { kind: 'gps'; lat: number; lng: number }
  | { kind: 'zip'; zip: string; isDefault: boolean };

/**
 * Saved coordinates win (the shopper chose "Use my location"); saving a ZIP clears them,
 * so a profile with only a ZIP searches from that ZIP. Nothing saved: the default ZIP.
 */
export function searchOriginFromProfile(profile: ProfileLocation | null | undefined): SearchOrigin {
  if (profile && profile.homeLat != null && profile.homeLng != null) {
    return { kind: 'gps', lat: profile.homeLat, lng: profile.homeLng };
  }
  const zip = profile?.homeZip?.trim() ?? '';
  if (isValidUsZip(zip)) return { kind: 'zip', zip: zip.slice(0, 5), isDefault: false };
  return { kind: 'zip', zip: STORES.defaultZip, isDefault: true };
}

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * The "Find stores near you" card: shown until the shopper picks location or a ZIP. Not while
 * the browser is about to locate on its own (already allowed), and not before the permission is known.
 */
export function shouldShowLocationPrompt(origin: SearchOrigin, permission: GeoPermission | null): boolean {
  if (origin.kind === 'gps' || !origin.isDefault) return false;
  return permission === 'prompt' || permission === 'denied' || permission === 'unavailable';
}

/** Already allowed in the browser and nothing chosen yet (or GPS chosen before): locate on open. */
export function shouldAutoLocate(origin: SearchOrigin, permission: GeoPermission | null): boolean {
  if (permission !== 'granted') return false;
  return origin.kind === 'gps' || origin.isDefault;
}
