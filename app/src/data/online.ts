import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { messages } from './errors';

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

function subscribe(onChange: () => void): () => void {
  return onlineManager.subscribe(() => onChange());
}

function getSnapshot(): boolean {
  return onlineManager.isOnline();
}

function getServerSnapshot(): boolean {
  return true;
}
