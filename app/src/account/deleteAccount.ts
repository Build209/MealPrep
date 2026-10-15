/**
 * Deletes the signed-in person's account through the live delete-user-account function (unchanged;
 * same request as the old app, built in deleteRequest.ts). On success the session is removed from
 * this device only (`scope: 'local'`): the account no longer exists on the server, so there is
 * nothing to sign out of there.
 */
import { env } from '../lib/env';
import { getSupabase } from '../lib/supabase';
import { markAccountDeleted } from './afterDelete';
import { buildDeleteRequest, deleteFailure, deleteOutcome, type DeleteOutcome } from './deleteRequest';

export async function deleteOwnAccount(): Promise<DeleteOutcome> {
  const client = getSupabase();
  if (!client) return deleteFailure('not-configured');

  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return deleteFailure('signed-out');

  const request = buildDeleteRequest(env.supabaseUrl, token);
  if (!request) return deleteFailure('not-configured');

  let response: Response;
  try {
    response = await fetch(request.url, request.init);
  } catch {
    return deleteFailure('network');
  }
  const json: unknown = await response.json().catch(() => ({}));
  const outcome = deleteOutcome(response.status, json);

  if (outcome.ok) {
    markAccountDeleted();
    // The account is gone either way; a failure here only leaves a dead token on this device.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
  return outcome;
}
