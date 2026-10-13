/**
 * Public settings, read at build time from EXPO_PUBLIC_* variables.
 * The publishable (anon) key is meant to be public; never put a service-role key here.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

/**
 * A usable server address: https anywhere, or plain http only on this machine
 * (the local Supabase stack that CI's end-to-end tests run against).
 */
export function isUsableSupabaseUrl(url: string): boolean {
  if (url.startsWith('https://')) return true;
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url);
}

export function isSupabaseConfigured(): boolean {
  return isUsableSupabaseUrl(env.supabaseUrl) && env.supabaseAnonKey.length > 0;
}
