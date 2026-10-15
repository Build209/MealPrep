/**
 * Usage log, sending side: `logEvent(name, props)` writes one row to `public.app_events`.
 * See eventRules.ts for the event list and what a row may hold.
 *
 * Promises this file keeps:
 * - Signed-in accounts only (the table's insert policy needs user_id = auth.uid()). Signed out,
 *   or a build without Supabase settings, records nothing.
 * - Fire and forget: it returns straight away, never throws and never shows an error. Losing an
 *   event is fine; breaking a tap is not.
 * - A write the server refuses for good (table missing, permission, check) stops the log for the
 *   rest of this app start, so it does not keep sending requests that cannot succeed.
 */
import { Platform } from 'react-native';
import { getSupabase } from './supabase';
import { buildEventRow, newEventSessionId, shouldStopAfter, type EventName, type EventProps } from './eventRules';

export const EVENTS_TABLE = 'app_events';

const sessionId = newEventSessionId();
let stopped = false;

async function send(name: EventName, props: EventProps | undefined): Promise<void> {
  try {
    if (stopped) return;
    const client = getSupabase();
    if (!client) return;
    const row = buildEventRow(name, props ?? {}, sessionId, Platform.OS);
    if (!row) return;
    // Reads the saved session (no network): nothing is sent while signed out.
    const { data } = await client.auth.getSession();
    if (!data.session?.user.id) return;
    const { error, status } = await client.from(EVENTS_TABLE).insert(row);
    if (error && shouldStopAfter({ code: error.code, status })) stopped = true;
  } catch {
    // Offline or cut off: this event is lost, which is acceptable.
  }
}

/** Records one event in the background. Returns straight away and cannot fail. */
export function logEvent(name: EventName, props?: EventProps): void {
  try {
    void send(name, props);
  } catch {
    // Never let the log break the app.
  }
}

/**
 * Records one event and waits for it, but never longer than `maxWaitMs`. For the moment just
 * before the page is left (sending someone to Stripe), when a background write would be cut off.
 * Never rejects.
 */
export function logEventBeforeLeaving(name: EventName, props?: EventProps, maxWaitMs = 800): Promise<void> {
  try {
    return Promise.race([send(name, props), new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs))]);
  } catch {
    return Promise.resolve();
  }
}
