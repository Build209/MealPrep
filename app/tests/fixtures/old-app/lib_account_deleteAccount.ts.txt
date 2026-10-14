import { SUPABASE_URL, isDemoMode } from '../../config/appConfig';
import { getSupabase } from '../supabase';

export async function deleteUserAccount(): Promise<void> {
  if (isDemoMode()) {
    throw new Error('Account deletion is not available in demo mode.');
  }

  const client = getSupabase();
  if (!client) throw new Error('Sign in to delete your account.');

  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sign in to delete your account.');

  const base = SUPABASE_URL.trim().replace(/\/$/, '');
  if (!base) throw new Error('App is not configured for account deletion.');

  const response = await fetch(`${base}/functions/v1/delete-user-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  const json = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(json.error ?? 'Could not delete account. Try again or contact support.');
  }
}
