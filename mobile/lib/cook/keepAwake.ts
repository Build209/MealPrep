/**
 * Keeps the screen from sleeping while cooking, using the browser's Screen Wake Lock.
 *
 * Web only. On the phone app there is no wake lock yet: it needs the expo-keep-awake
 * package (a native module, so a new app build). Until then this does nothing there,
 * and the cook screen tells the user to keep the screen on themselves.
 *
 * Returns a function that releases the lock.
 */

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

interface DocumentLike {
  visibilityState?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export function keepScreenAwake(): () => void {
  const root = globalThis as unknown as {
    navigator?: { wakeLock?: WakeLockLike };
    document?: DocumentLike;
  };
  const wakeLock = root.navigator?.wakeLock;
  const doc = root.document;
  if (!wakeLock) return () => {};

  let sentinel: WakeLockSentinelLike | null = null;
  let released = false;

  const acquire = async () => {
    try {
      const next = await wakeLock.request('screen');
      if (released) {
        void next.release().catch(() => {});
        return;
      }
      sentinel = next;
    } catch {
      // Not allowed (battery saver, no user gesture yet, unsupported): cooking still works.
    }
  };

  // The browser drops the lock when the tab is hidden; take it again when the tab returns.
  const onVisibility = () => {
    if (!released && doc?.visibilityState === 'visible') void acquire();
  };

  void acquire();
  doc?.addEventListener?.('visibilitychange', onVisibility);

  return () => {
    released = true;
    doc?.removeEventListener?.('visibilitychange', onVisibility);
    const current = sentinel;
    sentinel = null;
    if (current) void current.release().catch(() => {});
  };
}
