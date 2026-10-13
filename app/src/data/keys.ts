/**
 * Query keys, in one place. Every key that holds a person's data starts with the
 * feature name and includes the user id, so two accounts on one device never share
 * a cache entry and `invalidateQueries({ queryKey: keys.pantry.all })` reaches every
 * pantry query at once.
 *
 * Keys are plain arrays of strings: the same input always gives an equal key.
 */

/** Stands in for the user id before anyone is signed in. */
export const SIGNED_OUT = 'signed-out';

function scope(userId: string | null | undefined): string {
  return userId ? userId : SIGNED_OUT;
}

export const keys = {
  auth: {
    all: ['auth'] as const,
    /** The signed-in user's id (or null). */
    session: () => ['auth', 'session'] as const,
  },
  profile: {
    all: ['profile'] as const,
    own: (userId: string | null | undefined) => ['profile', scope(userId)] as const,
  },
  pantry: {
    all: ['pantry'] as const,
    list: (userId: string | null | undefined) => ['pantry', scope(userId), 'list'] as const,
  },
} as const;

/**
 * Mutation keys. Used to ask "is another change of this kind still running?" before
 * refetching, so a refetch never overwrites a change the server has not answered yet.
 */
export const mutationKeys = {
  pantry: {
    all: ['pantry'] as const,
    updateQuantity: () => ['pantry', 'update-quantity'] as const,
  },
} as const;
