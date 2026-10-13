/**
 * Public settings, read at build time from EXPO_PUBLIC_* variables.
 * The publishable (anon) key is meant to be public; never put a service-role key here.
 * Each variable must be written out in full (process.env.EXPO_PUBLIC_...) so Expo can fill it in.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** "preview" only in the phone preview build (app-preview.yml). */
  appChannel: process.env.EXPO_PUBLIC_APP_CHANNEL ?? '',
  /** The git commit the build was made from, when CI provides it. */
  gitSha: process.env.EXPO_PUBLIC_GIT_SHA ?? '',
};

export function isSupabaseConfigured(): boolean {
  return env.supabaseUrl.startsWith('https://') && env.supabaseAnonKey.length > 0;
}
