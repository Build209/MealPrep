import { MutationCache, QueryClient } from '@tanstack/react-query';
import { refuseWhenOffline } from '../data/online';

/**
 * The server is the only source of truth (spec v1, section 3). Screens read through
 * queries and never keep a second copy of server data. Online-first: the last data
 * loaded stays on screen without a signal; changes need a connection.
 *
 * Changes (mutations) never wait for a connection:
 * - The mutation cache refuses every change while offline, before the mutation's own
 *   onMutate, so nothing changes on screen and the error is "You're offline. Changes
 *   need a connection." (one check for every save, not one per screen).
 * - networkMode 'always': TanStack Query's default ('online') pauses a mutation that
 *   starts offline and sends it when the connection returns. That showed "Saving..."
 *   with no end, then saved on its own later. With 'always' a mutation is never paused:
 *   it runs now and either succeeds or fails with a plain message (a connection lost
 *   mid-request fails as a network error). Nothing is queued.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onMutate: () => refuseWhenOffline(),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: 0,
        networkMode: 'always',
      },
    },
  });
}
