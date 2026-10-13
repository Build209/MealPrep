import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase clients for the LOCAL stack only. Refuses anything that is not on this machine,
 * so these tests can never write to the live project.
 */
function setting(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see playwright.config.ts).`);
  return value;
}

export function localUrl(): string {
  const url = setting('E2E_SUPABASE_URL');
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
    throw new Error('E2E_SUPABASE_URL must be the local stack (http://127.0.0.1:<port>).');
  }
  return url;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Bypasses row level security: test setup only (seeding rows, creating a second user). */
export function adminClient(): SupabaseClient {
  return createClient(localUrl(), setting('E2E_SUPABASE_SERVICE_ROLE_KEY'), noSession);
}

/** Acts as a person, like the app does. Pass an access token to act as an existing session. */
export function userClient(accessToken?: string): SupabaseClient {
  return createClient(localUrl(), setting('E2E_SUPABASE_ANON_KEY'), {
    ...noSession,
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

/** A fresh address per run, so tests never depend on leftovers. */
export function freshEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
