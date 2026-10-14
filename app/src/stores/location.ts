import { roundCoordsForPrivacy, type GeoPermission } from './logic';

/**
 * Web: the browser's location, the old app's way (mobile/lib/stores/requestStoresLocation.ts and
 * storesGeolocation.ts). The Permissions API is asked first so the screen can offer the right
 * card without prompting; the position is rounded to 2 decimals before anything else sees it.
 */

export async function queryGeoPermission(): Promise<GeoPermission> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unavailable';
  if (!navigator.permissions?.query) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

/** Rounded position, or null when refused, unavailable or timed out. */
export function requestDeviceLocation(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(roundCoordsForPrivacy(pos.coords.latitude, pos.coords.longitude)),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 600_000 },
    );
  });
}
