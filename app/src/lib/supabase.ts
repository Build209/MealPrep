import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { authStorage, watchAppState } from './authStorage';
import { env, isSupabaseConfigured } from './env';

let client: SupabaseClient | null = null;

const isWeb = Platform.OS === 'web';

/**
 * The address the web app was opened with, read once when this file loads. supabase-js reads a
 * reset or confirm link's tokens from the address and then removes them, so the reset screen
 * looks here to know it was opened from a reset link. Empty on phones.
 */
export const openedWith: { hash: string; search: string } = (() => {
  const location = (globalThis as { location?: { hash?: string; search?: string } }).location;
  return isWeb && location ? { hash: location.hash ?? '', search: location.search ?? '' } : { hash: '', search: '' };
})();

/**
 * The one Supabase client. Returns null when the build has no Supabase settings
 * (for example a local build without .env), so screens can say so instead of crashing.
 * Session handling lives in src/auth/AuthProvider.tsx. The session is kept on the device:
 * the browser's localStorage on the web, AsyncStorage on phones (src/lib/authStorage.native.ts),
 * so closing the app does not sign people out.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        ...(authStorage ? { storage: authStorage } : {}),
        persistSession: true,
        autoRefreshToken: true,
        // Only the web has an address bar with link tokens in it.
        detectSessionInUrl: isWeb,
      },
    });
    const auth = client.auth;
    watchAppState(
      () => void auth.startAutoRefresh(),
      () => void auth.stopAutoRefresh(),
    );
  }
  return client;
}

// Web: start the client as soon as the app loads, so it reads a reset or confirm link from the
// address before anything else can change the address.
if (isWeb) getSupabase();
