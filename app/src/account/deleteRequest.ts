/**
 * The account deletion request and what its answers mean, kept free of React and the network so
 * tests can run it (tests/account-delete-request.test.ts).
 *
 * The request is the old app's exactly (mobile/lib/account/deleteAccount.ts): POST to
 * <SUPABASE_URL>/functions/v1/delete-user-account with the signed-in person's access token as a
 * Bearer token, JSON content type and the body `{}`. The live function is not changed by this file.
 */
import { ACCOUNT_DELETE_ERRORS } from './copy';

export const DELETE_FUNCTION = 'delete-user-account';

export type DeleteRequest = {
  url: string;
  init: { method: 'POST'; headers: Record<string, string>; body: string };
};

/** Null when the build has no server address. */
export function buildDeleteRequest(supabaseUrl: string, accessToken: string): DeleteRequest | null {
  const base = supabaseUrl.trim().replace(/\/+$/, '');
  if (!base) return null;
  return {
    url: `${base}/functions/v1/${DELETE_FUNCTION}`,
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    },
  };
}

export type DeleteFailureKind = 'not-configured' | 'signed-out' | 'network' | 'cancel-failed' | 'server';

export type DeleteOutcome = { ok: true } | { ok: false; kind: DeleteFailureKind; message: string };

const messageFor: Record<DeleteFailureKind, string> = {
  'not-configured': ACCOUNT_DELETE_ERRORS.notConfigured,
  'signed-out': ACCOUNT_DELETE_ERRORS.signedOut,
  network: ACCOUNT_DELETE_ERRORS.network,
  'cancel-failed': ACCOUNT_DELETE_ERRORS.cancelFailed,
  server: ACCOUNT_DELETE_ERRORS.failed,
};

export function deleteFailure(kind: DeleteFailureKind): DeleteOutcome {
  return { ok: false, kind, message: messageFor[kind] };
}

/**
 * What the function's answer means. Success is any 2xx, as in the old app (the function answers
 * `{ ok: true }`). 401 means the session is not valid. CANCEL_FAILED means MealPlanatic Plus could
 * not be cancelled, so nothing was deleted: the function's own sentence is shown. Anything else is
 * a plain "could not delete" (the function's other errors are raw database messages).
 */
export function deleteOutcome(status: number, json: unknown): DeleteOutcome {
  if (status >= 200 && status < 300) return { ok: true };
  const body = (json && typeof json === 'object' ? json : {}) as { code?: unknown };
  if (status === 401) return deleteFailure('signed-out');
  if (body.code === 'CANCEL_FAILED') return deleteFailure('cancel-failed');
  return deleteFailure('server');
}
