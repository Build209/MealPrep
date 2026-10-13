import { QueryClient } from '@tanstack/react-query';

/**
 * The server is the only source of truth (spec v1, section 3). Screens read through
 * queries and never keep a second copy of server data. Online-first: the last data
 * loaded stays on screen without a signal; changes need a connection.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
