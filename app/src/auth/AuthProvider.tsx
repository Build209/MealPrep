import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSupabase } from '../lib/supabase';

type AuthState = {
  /** False until the saved session (if any) has been read. Screens wait rather than flash sign-in. */
  ready: boolean;
  session: Session | null;
  /** False when the build has no Supabase settings: sign-in says so instead of crashing. */
  configured: boolean;
};

const AuthContext = createContext<AuthState>({ ready: false, session: null, configured: false });

/**
 * Holds the signed-in session for the whole app. The auth client is the only source of truth:
 * this listens to onAuthStateChange (which also reports the saved session on start) and never
 * keeps its own idea of who is signed in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(supabase === null);
  const [session, setSession] = useState<Session | null>(null);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      const nextUserId = next?.user.id ?? null;
      // A different person (or nobody) now: drop every cached query so nothing of the last
      // account shows. Synchronous only: Supabase asks that this callback not await its calls.
      if (lastUserId.current !== null && lastUserId.current !== nextUserId) queryClient.clear();
      lastUserId.current = nextUserId;
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase, queryClient]);

  const value = useMemo<AuthState>(
    () => ({ ready, session, configured: supabase !== null }),
    [ready, session, supabase],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
