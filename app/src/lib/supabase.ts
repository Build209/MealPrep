import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

let client: SupabaseClient | null = null;

/**
 * The one Supabase client. Returns null when the build has no Supabase settings
 * (for example a local build without .env), so screens can say so instead of crashing.
 * Session handling lives in src/auth/AuthProvider.tsx. On web the session is kept in the
 * browser's storage; native builds have no storage adapter yet, so a phone build forgets the
 * session when the app is closed (to add with the phone preview build).
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
