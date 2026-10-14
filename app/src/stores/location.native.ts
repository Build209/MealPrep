import * as ExpoLocation from 'expo-location';
import { STORES_COPY } from './copy';
import { createPhoneLocation } from './deviceLocation';

/**
 * Phones: the device's location through expo-location (foreground only, the old app's package).
 * The logic lives in deviceLocation.ts so it can be tested in Node without native code. The
 * position is rounded to 2 decimals before the screen sees it, the same rule as web.
 */
const phone = createPhoneLocation(ExpoLocation);

export const queryGeoPermission = phone.queryGeoPermission;
export const locateDevice = phone.locateDevice;
export const requestDeviceLocation = phone.requestDeviceLocation;

/** Shown on the card when location is refused: phones have Settings, not an address bar. */
export const locationDeniedHelp: string = STORES_COPY.phoneLocationDeniedHelp;
