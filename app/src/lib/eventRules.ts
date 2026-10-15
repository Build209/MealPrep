/**
 * Usage log rules: which events the app records and what an event row may hold. Pure (no
 * network, React or React Native), so tests/events.test.ts runs it with tsx.
 *
 * Rows go to `public.app_events`, the same table the old app (mobile/lib/usage) writes. Names
 * the old app already used are kept so old and new rows count together:
 *   app_open, scan_saved (old name for a finished scan), ask_forky_asked (old name for a Forky
 *   question), checkout_started (old prop `plan` = "<tier>_<interval>" is still sent).
 *
 * What may go in: the event name and a few small values (a code word, a whole number, yes/no).
 * What never goes in: emails, item or recipe names, anything the person typed, photos, location.
 * `cleanEventProps` enforces that: only the keys below pass, and a string must be one short
 * code word, so a name with a space or a sentence is dropped.
 */

export const EVENT_NAMES = [
  /** The app started (once per app start) with a signed-in account. props: standalone (web) */
  'app_open',
  /** An account was created and is signed in (straight away, or via the confirm link). */
  'sign_up',
  /** Signed in with email and password. */
  'sign_in',
  /** Sent to Stripe checkout. props: tier, interval, plan ("<tier>_<interval>", old app's prop) */
  'checkout_started',
  /** Came back from Stripe checkout with the success marker. */
  'checkout_success',
  /** Came back from Stripe checkout with the cancel marker. */
  'checkout_cancelled',
  /** Items from a shelf or receipt scan were saved to the pantry. props: kind, count (old name) */
  'scan_saved',
  /** An imported recipe was saved. props: source (youtube, web, tiktok, photo, ...) */
  'import_done',
  /** A question was sent to Ask Forky and answered. No text is recorded (old name). */
  'ask_forky_asked',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** The database's own check on `app_events.name`. */
export const EVENT_NAME_FORMAT = /^[a-z][a-z0-9_]{2,39}$/;

const NAME_SET: ReadonlySet<string> = new Set(EVENT_NAMES);

export function isEventName(name: unknown): name is EventName {
  return typeof name === 'string' && NAME_SET.has(name) && EVENT_NAME_FORMAT.test(name);
}

/** Only these keys are ever sent (the old app's keys plus tier and interval). */
export const EVENT_PROP_KEYS = ['kind', 'source', 'plan', 'tier', 'interval', 'count', 'standalone'] as const;
export type EventPropKey = (typeof EVENT_PROP_KEYS)[number];
export type EventProps = Partial<Record<EventPropKey, string | number | boolean>>;

const PROP_KEY_SET: ReadonlySet<string> = new Set(EVENT_PROP_KEYS);
/** A code word such as "receipt" or "plus_month": letters, digits, dash and underscore only. */
const CODE_WORD = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const MAX_COUNT = 100_000;

/** Keeps only allowed keys with safe values; everything else is dropped silently. */
export function cleanEventProps(props: unknown): EventProps {
  const out: EventProps = {};
  if (!props || typeof props !== 'object' || Array.isArray(props)) return out;
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (!PROP_KEY_SET.has(key)) continue;
    if (typeof value === 'boolean') {
      out[key as EventPropKey] = value;
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key as EventPropKey] = Math.max(0, Math.min(MAX_COUNT, Math.round(value)));
    } else if (typeof value === 'string' && CODE_WORD.test(value)) {
      out[key as EventPropKey] = value;
    }
  }
  return out;
}

export type EventPlatform = 'web' | 'ios' | 'android';

export type EventRow = {
  name: EventName;
  props: EventProps;
  session_id: string;
  platform: EventPlatform;
};

/** One row for `app_events` (user_id is filled in by the database: default auth.uid()). */
export function buildEventRow(name: unknown, props: unknown, sessionId: string, platform: string): EventRow | null {
  if (!isEventName(name)) return null;
  const safePlatform: EventPlatform = platform === 'ios' || platform === 'android' ? platform : 'web';
  return { name, props: cleanEventProps(props), session_id: sessionId.slice(0, 40), platform: safePlatform };
}

/** A new id for this app start (well under the 40 characters the table allows). */
export function newEventSessionId(now: number = Date.now(), random: () => number = Math.random): string {
  return `${now.toString(36)}-${random().toString(36).slice(2, 10)}`.slice(0, 40);
}

/**
 * After a refused write, stop sending for the rest of this app start? A missing table, a refused
 * permission or a failed check will not fix itself; anything else (offline, timeout) might.
 */
export function shouldStopAfter(error: { code?: string | null; status?: number | null } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const status = error.status ?? 0;
  return code === '42P01' || code === 'PGRST205' || code === '42501' || code === '23514' || status === 404 || status === 401 || status === 403;
}

/** The old app's `checkout_started` props, plus tier and interval on their own. */
export function checkoutStartedProps(tier: string, interval: string): EventProps {
  return cleanEventProps({ tier, interval, plan: `${tier}_${interval}` });
}

/** `scan_saved` props: a receipt if any saved row came from a receipt (old app's rule), and how many. */
export function scanSavedProps(rows: readonly { kind: string }[], count: number): EventProps {
  return cleanEventProps({ kind: rows.some((row) => row.kind === 'receipt') ? 'receipt' : 'shelf', count });
}

/**
 * Whether the app was opened from a "confirm your email" link (Supabase puts type=signup in the
 * address it sends people back to). Used to record `sign_up` when sign-up needed a confirm step.
 */
export function openedFromConfirmLink(hash: string, search: string): boolean {
  return /[#&?]type=signup(&|$)/.test(`${hash}&${search}`);
}
