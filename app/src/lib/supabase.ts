import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

let client: SupabaseClient | null = null;

/**
 * The one Supabase client. Returns null when the build has no Supabase settings
 * (for example a local build without .env), so screens can say so instead of crashing.
 * Sign-in (next step of phase 0) adds session handling on top of this.
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
