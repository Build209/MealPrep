import { loadZctaCentroids, type ZctaCentroidMap } from './zctaTable';

/**
 * ZIP to a point, the old app's way (mobile/lib/stores/nominatim.ts geocodeUsZip +
 * storesTabGeocode.ts): a small built-in table for the home area first, then the bundled
 * Census ZCTA centroid table (public/zcta-centroids.json, copied unchanged from mobile/).
 * No live geocoding service is called.
 */

export type GeocodedPoint = { lat: number; lng: number; label?: string };

export type GeocodeResult = { ok: true; point: GeocodedPoint } | { ok: false; reason: 'invalid_zip' | 'not_found' | 'network' };

/** Central Valley ZIPs (mobile/lib/stores/localZipTable.ts). */
const LOCAL_ZIP_PLACES: Record<string, { city: string; state: string; lat: number; lng: number }> = {
  '95320': { city: 'Escalon', state: 'CA', lat: 37.7974, lng: -120.9966 },
  '95350': { city: 'Modesto', state: 'CA', lat: 37.6391, lng: -120.9969 },
  '95351': { city: 'Modesto', state: 'CA', lat: 37.6258, lng: -121.0022 },
  '95352': { city: 'Modesto', state: 'CA', lat: 37.6612, lng: -120.9445 },
  '95353': { city: 'Modesto', state: 'CA', lat: 37.6391, lng: -120.9969 },
  '95354': { city: 'Modesto', state: 'CA', lat: 37.6391, lng: -120.9969 },
  '95355': { city: 'Modesto', state: 'CA', lat: 37.6819, lng: -121.0528 },
  '95356': { city: 'Modesto', state: 'CA', lat: 37.703, lng: -121.0555 },
  '95357': { city: 'Modesto', state: 'CA', lat: 37.6105, lng: -120.9185 },
  '95358': { city: 'Modesto', state: 'CA', lat: 37.6105, lng: -120.9185 },
  '95361': { city: 'Oakdale', state: 'CA', lat: 37.7666, lng: -120.8472 },
  '95367': { city: 'Riverbank', state: 'CA', lat: 37.7358, lng: -120.9266 },
};

export function lookupLocalZip(zip: string): GeocodedPoint | null {
  const row = LOCAL_ZIP_PLACES[zip.trim().slice(0, 5)];
  return row ? { lat: row.lat, lng: row.lng, label: `${row.city}, ${row.state}` } : null;
}

export function lookupZcta(map: ZctaCentroidMap, zip: string): GeocodedPoint | null {
  const row = map[zip.trim().slice(0, 5)];
  if (!row) return null;
  const [lat, lng] = row;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** `load` is replaceable for tests. */
export async function geocodeUsZip(zip: string, load: () => Promise<ZctaCentroidMap> = loadZctaCentroids): Promise<GeocodeResult> {
  const normalized = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(normalized)) return { ok: false, reason: 'invalid_zip' };
  const local = lookupLocalZip(normalized);
  if (local) return { ok: true, point: local };
  let map: ZctaCentroidMap;
  try {
    map = await load();
  } catch {
    return { ok: false, reason: 'network' };
  }
  const point = lookupZcta(map, normalized);
  return point ? { ok: true, point } : { ok: false, reason: 'not_found' };
}
