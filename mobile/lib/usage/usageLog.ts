/**
 * Usage log, running side: queues events and sends them to the `app_events` table in small
 * batches. See `usageEvents.ts` for what may be recorded.
 *
 * Promises this file keeps:
 * - Signed-in accounts only. Guests, demo mode and a signed-out visitor record nothing.
 * - It never throws and never shows an error. Losing an event is fine; breaking a tap is not.
 * - If the table is missing or refuses the write, it stops for the rest of the visit.
 */
import { Platform } from 'react-native';
import { getSupabase } from '../supabase';
import {
  buildUsageEventRow,
  enqueueUsageEvent,
  isNewUsageSession,
  takeUsageBatch,
  USAGE_LOG_LIMITS,
  usageSendOutcome,
  type UsageEventName,
  type UsageEventRow,
  type UsageProps,
} from './usageEvents';

export const USAGE_EVENTS_TABLE = 'app_events';

let enabled = false;
let stopped = false;
let queue: UsageEventRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let sending = false;
let sessionId = newSessionId();
let hiddenAtMs: number | null = null;
let listenersAttached = false;
let retriedBatch = false;

function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isStandalone(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

function scheduleFlush(): void {
  if (flushTimer || stopped) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushUsageLog();
  }, USAGE_LOG_LIMITS.flushDelayMs);
}

/** Sends what is waiting. Safe to call at any time. */
export async function flushUsageLog(): Promise<void> {
  if (sending || stopped || !enabled || queue.length === 0) return;
  const supabase = getSupabase();
  if (!supabase) return;
  sending = true;
  const { batch, rest } = takeUsageBatch(queue);
  queue = rest;
  try {
    const { error, status } = await supabase.from(USAGE_EVENTS_TABLE).insert(batch);
    const outcome = usageSendOutcome(error ? { code: error.code, status } : null);
    if (outcome === 'stop') {
      stopped = true;
      queue = [];
    } else if (outcome === 'retry' && !retriedBatch) {
      retriedBatch = true;
      queue = [...batch, ...queue].slice(0, USAGE_LOG_LIMITS.maxQueued);
    } else {
      retriedBatch = false;
    }
  } catch {
    // Offline or the request was cut off: this batch is lost, which is acceptable.
    retriedBatch = false;
  } finally {
    sending = false;
    if (queue.length > 0 && !stopped) scheduleFlush();
  }
}

/**
 * Records one event. Call it from anywhere; it returns straight away and cannot fail.
 * Nothing is recorded unless a signed-in account is active (see `setUsageLogAccount`).
 */
export function logUsageEvent(name: UsageEventName, props?: UsageProps): void {
  try {
    if (!enabled || stopped) return;
    const row = buildUsageEventRow(name, props ?? {}, sessionId, Platform.OS);
    if (!row) return;
    queue = enqueueUsageEvent(queue, row);
    scheduleFlush();
  } catch {
    // Never let the log break the app.
  }
}

function attachListeners(): void {
  if (listenersAttached || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  listenersAttached = true;
  document.addEventListener('visibilitychange', () => {
    try {
      if (document.visibilityState === 'hidden') {
        hiddenAtMs = Date.now();
        // Leaving the tab or the app: send now, a timer may never fire.
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        void flushUsageLog();
        return;
      }
      if (isNewUsageSession(hiddenAtMs, Date.now())) {
        sessionId = newSessionId();
        logUsageEvent('app_open', { standalone: isStandalone() });
      }
      hiddenAtMs = null;
    } catch {
      // Ignore.
    }
  });
}

/**
 * Tells the log whether a signed-in account is active. The app's root calls this whenever the
 * account changes. Turning it on records one `app_open`; turning it off forgets anything unsent.
 */
export function setUsageLogAccount(active: boolean): void {
  try {
    if (active === enabled) return;
    enabled = active;
    if (!active) {
      queue = [];
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      return;
    }
    attachListeners();
    logUsageEvent('app_open', { standalone: isStandalone() });
  } catch {
    // Ignore.
  }
}
