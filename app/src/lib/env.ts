/**
 * Public settings, read at build time from EXPO_PUBLIC_* variables.
 * The publishable (anon) key is meant to be public; never put a service-role key here.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export function isSupabaseConfigured(): boolean {
  return env.supabaseUrl.startsWith('https://') && env.supabaseAnonKey.length > 0;
}
