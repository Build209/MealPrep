import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { openedFromConfirmLink } from './eventRules';
import { logEvent } from './events';
import { openedWith } from './supabase';

/** Account ids that already have an `app_open` for this app start. */
const openedFor = new Set<string>();
/** Whether this app start came from a "confirm your email" link (web only; read once). */
let confirmLinkPending = openedFromConfirmLink(openedWith.hash, openedWith.search);

function isStandalone(): boolean {
  try {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/**
 * Mounted once in the root layout. Records `app_open` once per app start for each signed-in
 * account (signing in later in the same start counts as the open), and `sign_up` when the app was
 * opened from a confirm link and that link signed the person in.
 */
export function useAppOpenEvent(): void {
  const { ready, session } = useAuth();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!ready || !userId) return;
    if (confirmLinkPending) {
      confirmLinkPending = false;
      logEvent('sign_up');
    }
    if (openedFor.has(userId)) return;
    openedFor.add(userId);
    logEvent('app_open', Platform.OS === 'web' ? { standalone: isStandalone() } : undefined);
  }, [ready, userId]);
}
