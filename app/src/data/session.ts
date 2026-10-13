import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { notConfiguredError, retryUnlessPermanent, signedOutError, toDataError } from './errors';
import { keys } from './keys';

/** The Supabase client, or a DataError('not-configured') when the build has no settings. */
export function requireClient(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw notConfiguredError();
  return client;
}

/** The signed-in user's id, or a DataError('signed-out'). */
export function requireUserId(userId: string | null | undefined): string {
  if (!userId) throw signedOutError();
  return userId;
}

/**
 * The signed-in user's id (data: string | null). Reads the stored session, so it works
 * offline, and follows sign-in and sign-out. Without server settings it ends in an
 * error state with a plain message instead of loading forever.
 */
export function useSessionUserId() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(keys.auth.session(), session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: keys.auth.session(),
    queryFn: async (): Promise<string | null> => {
      const client = requireClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw toDataError(error);
      return data.session?.user.id ?? null;
    },
    staleTime: Infinity, // onAuthStateChange keeps it current
    retry: retryUnlessPermanent,
  });
}
