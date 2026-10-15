import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { messages, offlineError } from './errors';

/**
 * True while the device has a connection, from TanStack Query's onlineManager (on web
 * it follows the browser's online/offline events). Queries pause while offline and the
 * last loaded data stays on screen; changes are refused with a plain message.
 *
 *   const online = useIsOnline();
 *   {!online && <AppText>{OFFLINE_MESSAGE}</AppText>}
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const OFFLINE_MESSAGE = messages.offline;

/** For non-React code (mutations): is there a connection right now? */
export function isOnlineNow(): boolean {
  return onlineManager.isOnline();
}

/**
 * Throws the plain offline error when there is no connection. The QueryClient runs this before
 * every mutation (src/lib/queryClient.ts), so a change made offline fails at once, before any
 * optimistic update, and is never held to be sent later.
 */
export function refuseWhenOffline(): void {
  if (!isOnlineNow()) throw offlineError();
}

function subscribe(onChange: () => void): () => void {
  return onlineManager.subscribe(() => onChange());
}

function getSnapshot(): boolean {
  return onlineManager.isOnline();
}

function getServerSnapshot(): boolean {
  return true;
}
