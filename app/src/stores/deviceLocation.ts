import { STORES_COPY } from './copy';
import { roundCoordsForPrivacy, type GeoPermission } from './logic';

/**
 * The phone's location for the Stores tab, written against a small slice of expo-location that is
 * passed in (location.native.ts passes the real module; tests pass a fake), so this file never
 * loads native code. Rules, same as web:
 *  - foreground only: background location is never asked for;
 *  - the permission prompt appears only when the shopper taps "Use my location"
 *    (queryGeoPermission only reads the current state);
 *  - the position is rounded to 2 decimals (roundCoordsForPrivacy) before anything else sees it.
 */

/** What the Stores screen gets back from a tap on "Use my location" (web and phones). */
export type LocationProblem = 'denied' | 'services_off' | 'timeout' | 'unavailable' | 'failed';
export type LocateResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; problem: LocationProblem; message: string | null };

type PermissionLike = { status: string; granted: boolean; canAskAgain: boolean };
type PositionLike = { coords: { latitude: number; longitude: number } };

/** The part of expo-location used here. */
export type ExpoLocationApi = {
  getForegroundPermissionsAsync(): Promise<PermissionLike>;
  requestForegroundPermissionsAsync(): Promise<PermissionLike>;
  hasServicesEnabledAsync(): Promise<boolean>;
  getLastKnownPositionAsync(options?: { maxAge?: number }): Promise<PositionLike | null>;
  getCurrentPositionAsync(options?: { accuracy?: number }): Promise<PositionLike>;
  Accuracy: { Balanced: number };
};

/** Same limits as the web call: give up after 12 s; a fix up to 10 minutes old is fine. */
export const PHONE_LOCATION_TIMEOUT_MS = 12_000;
export const PHONE_LOCATION_MAX_AGE_MS = 600_000;

/** expo-location's permission answer → the screen's states. Reading it never prompts. */
export function mapPermission(response: PermissionLike | null | undefined): GeoPermission {
  if (!response) return 'unavailable';
  if (response.granted || response.status === 'granted') return 'granted';
  if (response.status === 'undetermined') return 'prompt';
  // Android can ask again after one "Don't allow"; iOS cannot (canAskAgain false).
  if (response.status === 'denied') return response.canAskAgain ? 'prompt' : 'denied';
  return 'unavailable';
}

/** Plain words for each problem; null where the card's own help text already says it. */
export function phoneProblemMessage(problem: LocationProblem): string | null {
  switch (problem) {
    case 'services_off':
      return STORES_COPY.phoneServicesOff;
    case 'timeout':
      return STORES_COPY.phoneTimeout;
    case 'failed':
      return STORES_COPY.phoneFailed;
    case 'denied': // the card shows STORES_COPY.phoneLocationDeniedHelp
    case 'unavailable': // the card shows STORES_COPY.zipOnlyHelp
      return null;
  }
}

/** An error thrown by expo-location → a problem. Codes from expo-location's native modules. */
export function mapLocationError(error: unknown): LocationProblem {
  const code = String((error as { code?: unknown } | null)?.code ?? '').toUpperCase();
  const text = `${code} ${String((error as { message?: unknown } | null)?.message ?? '')}`.toUpperCase();
  if (code === 'TIMEOUT' || text.includes('TIMEOUT') || text.includes('TIMED OUT')) return 'timeout';
  if (text.includes('SERVICES_DISABLED') || text.includes('SERVICES ARE DISABLED') || text.includes('LOCATION SERVICES')) {
    return 'services_off';
  }
  if (text.includes('UNAUTHORIZED') || text.includes('PERMISSION') || text.includes('NOT AUTHORIZED')) return 'denied';
  // Anything else (including "no fix available right now") can be retried: say so, keep the button.
  return 'failed';
}

function fail(problem: LocationProblem): LocateResult {
  return { ok: false, problem, message: phoneProblemMessage(problem) };
}

class LocationTimeout extends Error {
  code = 'TIMEOUT';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LocationTimeout('Location timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createPhoneLocation(api: ExpoLocationApi | null, timeoutMs = PHONE_LOCATION_TIMEOUT_MS) {
  async function queryGeoPermission(): Promise<GeoPermission> {
    if (!api) return 'unavailable';
    try {
      return mapPermission(await api.getForegroundPermissionsAsync());
    } catch {
      return 'unavailable';
    }
  }

  /** Called only from the shopper's tap (or on open when already allowed, which never prompts). */
  async function locateDevice(): Promise<LocateResult> {
    if (!api) return fail('unavailable');
    try {
      let permission = await api.getForegroundPermissionsAsync();
      if (!permission.granted) {
        if (permission.status === 'denied' && !permission.canAskAgain) return fail('denied');
        permission = await api.requestForegroundPermissionsAsync();
        if (!permission.granted) return fail('denied');
      }
      if (!(await api.hasServicesEnabledAsync())) return fail('services_off');

      const recent = await api.getLastKnownPositionAsync({ maxAge: PHONE_LOCATION_MAX_AGE_MS }).catch(() => null);
      const position =
        recent ?? (await withTimeout(api.getCurrentPositionAsync({ accuracy: api.Accuracy.Balanced }), timeoutMs));
      const { latitude, longitude } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return fail('failed');
      // Privacy: rounded here, so the raw fix never leaves this function.
      return { ok: true, ...roundCoordsForPrivacy(latitude, longitude) };
    } catch (error) {
      return fail(mapLocationError(error));
    }
  }

  async function requestDeviceLocation(): Promise<{ lat: number; lng: number } | null> {
    const result = await locateDevice();
    return result.ok ? { lat: result.lat, lng: result.lng } : null;
  }

  return { queryGeoPermission, locateDevice, requestDeviceLocation };
}
