import { Linking } from 'react-native';

/**
 * Opens a web address outside the app (a new tab on the web, the browser or the video app on a
 * phone). Only call it with an address from watchLink(), which allows https only.
 */
export function openExternal(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}
