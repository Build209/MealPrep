import { getKrogerProxyUrl, SUPABASE_ANON_KEY } from '../../config/appConfig';
import type { StoreLocation } from './types';

export interface KrogerProxyStoreRow {
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
}

export interface KrogerProxyResponse {
  stores?: KrogerProxyStoreRow[];
  result?: Omit<import('./types').DealsSearchResult, 'mode' | 'providerId' | 'providerLabel' | 'pricingNote'>;
  configured?: boolean;
  error?: string;
}

export function isKrogerServerConfigured(payload: KrogerProxyResponse): boolean {
  return payload.configured !== false;
}

export async function callKrogerProxy(body: Record<string, unknown>): Promise<KrogerProxyResponse> {
  const url = getKrogerProxyUrl();
  if (!url) {
    return { configured: false, error: 'Kroger Edge Function URL is not available' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const anon = SUPABASE_ANON_KEY.trim();
  if (anon) headers.Authorization = `Bearer ${anon}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    return { configured: false, error: 'Could not reach store pricing. Try again shortly.' };
  }

  let payload: KrogerProxyResponse;
  try {
    payload = (await response.json()) as KrogerProxyResponse;
  } catch {
    return { configured: false, error: 'Could not load store prices. Try again shortly.' };
  }

  if (response.status === 503) {
    return { ...payload, configured: false, error: payload.error ?? 'Live Kroger prices are not set up yet.' };
  }
  if (!response.ok) {
    throw new Error(payload.error ?? `Kroger proxy failed (${response.status})`);
  }
  return { ...payload, configured: payload.configured ?? true };
}

type KrogerLocationsParams = {
  lat?: number;
  lng?: number;
  zip?: string;
  radiusMiles?: number;
};
type KrogerLocationsAnswer = { stores: KrogerProxyStoreRow[]; serverConfigured: boolean };

/** How long a store list for one place is reused on this device before the server is asked again. */
export const KROGER_LOCATIONS_REUSE_MS = 10 * 60 * 1000;

const locationsInFlight = new Map<string, Promise<KrogerLocationsAnswer>>();
const locationsRecent = new Map<string, { at: number; answer: KrogerLocationsAnswer }>();

/** Same place, same question: coordinates are compared to about 100 m. */
export function krogerLocationsKey(params: KrogerLocationsParams): string {
  const round = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(3) : '');
  const lat = round(params.lat);
  const lng = round(params.lng);
  // With a position the ZIP adds nothing (one caller passes it, another does not).
  const place = lat && lng ? `${lat},${lng}` : `zip:${(params.zip ?? '').trim()}`;
  return `${place}|${params.radiusMiles ?? ''}`;
}

/** For checks: forget every remembered answer. */
export function resetKrogerLocationsMemory(): void {
  locationsInFlight.clear();
  locationsRecent.clear();
}

/**
 * Nearby Kroger-family stores. The Stores tab asked this twice on every load (two parts of the
 * screen each asked for themselves); each call is a paid-for function run. One request per place
 * is now shared while it is on its way, and its answer is reused for a few minutes.
 */
export async function fetchKrogerLocations(
  params: KrogerLocationsParams,
  now: () => number = Date.now,
): Promise<KrogerLocationsAnswer> {
  if (!getKrogerProxyUrl()) {
    return { stores: [], serverConfigured: false };
  }

  const key = krogerLocationsKey(params);
  const recent = locationsRecent.get(key);
  if (recent && now() - recent.at < KROGER_LOCATIONS_REUSE_MS) return recent.answer;
  const pending = locationsInFlight.get(key);
  if (pending) return pending;

  const request = (async (): Promise<KrogerLocationsAnswer> => {
    const data = await callKrogerProxy({
      action: 'locations',
      lat: params.lat,
      lng: params.lng,
      zip: params.zip,
      radiusMiles: params.radiusMiles,
    });

    if (!isKrogerServerConfigured(data)) {
      // Not remembered: "not set up" or "could not reach" may be different a moment later.
      return { stores: [], serverConfigured: false };
    }
    const answer = { stores: data.stores ?? [], serverConfigured: true };
    locationsRecent.set(key, { at: now(), answer });
    return answer;
  })();

  locationsInFlight.set(key, request);
  try {
    return await request;
  } finally {
    locationsInFlight.delete(key);
  }
}

export function toKrogerStoreLocation(store: StoreLocation): StoreLocation {
  return {
    ...store,
    id: store.krogerLocationId ?? store.id,
  };
}
