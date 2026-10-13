/**
 * Errors the data layer throws. Every failure reaches screens as a DataError: an
 * Error whose `message` is plain words a person can read, plus a `kind` a screen can
 * branch on. The raw server error is kept in `cause` for debugging, never shown.
 */

export type DataErrorKind =
  | 'not-configured' // the build has no Supabase settings
  | 'signed-out' // nobody is signed in
  | 'offline' // the device has no connection
  | 'not-found' // the row is gone, or row level security hides it
  | 'forbidden' // row level security refused the change
  | 'network' // the request did not reach the server
  | 'invalid' // the app refused bad input before sending it
  | 'server'; // anything else the server said no to

/** Kinds where trying again right away cannot help, so queries do not retry them. */
const PERMANENT: ReadonlySet<DataErrorKind> = new Set(['not-configured', 'signed-out', 'not-found', 'forbidden', 'invalid']);

export class DataError extends Error {
  readonly kind: DataErrorKind;
  constructor(kind: DataErrorKind, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'DataError';
    this.kind = kind;
    if (options && 'cause' in options) (this as { cause?: unknown }).cause = options.cause;
  }
  get permanent(): boolean {
    return PERMANENT.has(this.kind);
  }
}

export const messages = {
  notConfigured: "This build has no server settings, so your data can't load.",
  signedOut: 'Sign in to see your kitchen.',
  offline: "You're offline. Changes need a connection.",
  notFound: "That item wasn't found. It may have been removed.",
  forbidden: "You don't have permission to change that.",
  network: "Couldn't reach the server. Check your connection and try again.",
  server: 'Something went wrong on our side. Please try again.',
} as const;

export const notConfiguredError = () => new DataError('not-configured', messages.notConfigured);
export const signedOutError = () => new DataError('signed-out', messages.signedOut);
export const offlineError = () => new DataError('offline', messages.offline);

/** The shape of a supabase-js (PostgREST) error. */
export type SupabaseLikeError = { message?: string; code?: string; details?: string | null; hint?: string | null };

/** Turns a supabase-js error (or a thrown fetch error) into a DataError with a plain message. */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  const e = (error ?? {}) as SupabaseLikeError;
  const code = typeof e.code === 'string' ? e.code : '';
  const raw = typeof e.message === 'string' ? e.message : '';

  // .single() found no row: deleted elsewhere, or hidden by row level security.
  if (code === 'PGRST116') return new DataError('not-found', messages.notFound, { cause: error });
  // insufficient_privilege: a row level security check refused the write.
  if (code === '42501') return new DataError('forbidden', messages.forbidden, { cause: error });
  if (/failed to fetch|network ?error|networkrequestfailed|load failed|fetch failed/i.test(raw)) {
    return new DataError('network', messages.network, { cause: error });
  }
  return new DataError('server', messages.server, { cause: error });
}

/** Query retry rule: never retry permanent failures, otherwise retry once. */
export function retryUnlessPermanent(failureCount: number, error: unknown): boolean {
  if (error instanceof DataError && error.permanent) return false;
  return failureCount < 1;
}

/**
 * Runs a supabase-js call and returns its data, throwing a DataError with a plain
 * message on failure. The caller names the row type (the client is not generated
 * from the schema, so rows.ts is where the column types live).
 */
export async function run<TData>(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<TData> {
  let response: { data: unknown; error: unknown };
  try {
    response = await request;
  } catch (thrown) {
    throw toDataError(thrown);
  }
  if (response.error) throw toDataError(response.error);
  if (response.data === null || response.data === undefined) throw toDataError({ code: 'PGRST116' });
  return response.data as TData;
}
