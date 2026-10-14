import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

/**
 * Phones (iOS and Android): keep the signed-in session in AsyncStorage, so sign-in survives
 * closing the app. The session holds tokens, not the password.
 */
export const authStorage = AsyncStorage;

/**
 * Supabase's advice for React Native: refresh the session only while the app is on screen, and
 * pick up again when it comes back to the front.
 */
export function watchAppState(start: () => void, stop: () => void): void {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') start();
    else stop();
  });
}
