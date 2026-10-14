import { chainMatchesKroger } from './chains';
import { haversineMiles, STORES, type Store } from './logic';

/**
 * Kroger-family stores from the live kroger-deals function's "locations" action, merged into the
 * list the way the old Stores tab does (mobile/lib/stores/krogerMerge.ts, lib/deals/krogerClient.ts).
 * The old Stores tab shows no Kroger prices or deals, only these locations, so neither does this one.
 *
 * Compliance rule 6: Kroger data is not stored. It lives only in the query's memory while the
 * screen is open (no persistence, no browser storage).
 */

export type KrogerLocationRow = {
  id: string;
  name: string;
  chain: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  url?: string;
};

/** The request body the old app sends. */
export function krogerLocationsBody(origin: { lat: number; lng: number }, zip: string | undefined) {
  return { action: 'locations', lat: origin.lat, lng: origin.lng, zip, radiusMiles: STORES.krogerRadiusMiles };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads the function's answer. `configured: false` (or HTTP 503) means Kroger is not set up on
 * the server: no rows, and the list is shown without them.
 */
export function parseKrogerLocations(status: number, payload: unknown): { rows: KrogerLocationRow[]; configured: boolean } {
  const body = (payload && typeof payload === 'object' ? payload : {}) as { stores?: unknown; configured?: unknown };
  if (status === 503 || body.configured === false) return { rows: [], configured: false };
  if (status < 200 || status >= 300) throw new Error(`kroger-deals failed (${status})`);
  const list = Array.isArray(body.stores) ? body.stores : [];
  const rows: KrogerLocationRow[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id);
    if (!id) continue;
    rows.push({
      id,
      name: str(r.name) || str(r.chain) || 'Kroger',
      chain: str(r.chain),
      addressLine: str(r.addressLine),
      city: str(r.city),
      state: str(r.state),
      zip: str(r.zip),
      lat: num(r.lat),
      lng: num(r.lng),
      url: str(r.url) || undefined,
    });
  }
  return { rows, configured: true };
}

/** Matches Kroger rows to listings within 0.35 mi; adds the ones with no listing as their own stores. */
export function mergeKrogerLocations(stores: readonly Store[], krogerStores: readonly KrogerLocationRow[]): Store[] {
  if (krogerStores.length === 0) return [...stores];
  const mergeRadius = STORES.krogerMergeRadiusMiles;
  const enriched: Store[] = stores.map((store) => {
    if (store.krogerLocationId) return store;
    let best: KrogerLocationRow | undefined;
    let bestDist = mergeRadius + 1;
    for (const k of krogerStores) {
      if (store.lat == null || store.lng == null || k.lat == null || k.lng == null) {
        const nameMatch =
          chainMatchesKroger(k.chain) &&
          (store.chain.toLowerCase().includes(k.chain.toLowerCase()) || store.name.toLowerCase().includes(k.chain.toLowerCase()));
        if (nameMatch && !best) best = k;
        continue;
      }
      const dist = haversineMiles({ lat: store.lat, lng: store.lng }, { lat: k.lat, lng: k.lng });
      if (dist <= mergeRadius && dist < bestDist) {
        best = k;
        bestDist = dist;
      }
    }
    if (!best) return store;
    return { ...store, krogerLocationId: best.id, pricingSource: 'kroger', chain: best.chain || store.chain };
  });

  const seen = new Set(enriched.filter((s) => s.krogerLocationId).map((s) => s.krogerLocationId));
  for (const k of krogerStores) {
    if (seen.has(k.id)) continue;
    enriched.push({
      id: `kroger-${k.id}`,
      name: k.name,
      chain: k.chain,
      addressLine: k.addressLine,
      city: k.city,
      state: k.state,
      zip: k.zip,
      lat: k.lat,
      lng: k.lng,
      source: 'kroger',
      pricingSource: 'kroger',
      krogerLocationId: k.id,
    });
  }
  return enriched;
}

/** The key a favourite is saved under (the old app's rule): Kroger's id when known, else the listing id. */
export function favoriteStoreKey(store: Pick<Store, 'id' | 'krogerLocationId'>): string {
  return store.krogerLocationId ?? store.id;
}
