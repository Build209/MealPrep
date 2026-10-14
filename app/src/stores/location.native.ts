import type { GeoPermission } from './logic';

/**
 * Phones: not built yet. The old app uses expo-location here; the new app does not have that
 * package yet, so on phones the Stores tab offers the ZIP only. Adding expo-location (and its
 * permission text in app.json) is a follow-up.
 */
export async function queryGeoPermission(): Promise<GeoPermission> {
  return 'unavailable';
}

export async function requestDeviceLocation(): Promise<{ lat: number; lng: number } | null> {
  return null;
}
