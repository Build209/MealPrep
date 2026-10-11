/**
 * Usage log: the list of events the app records, and the pure rules for building and batching
 * them. No network, storage or React here, so `scripts/usage-log-check.ts` can test it with tsx.
 *
 * What may go in an event: its name and a few small values (a prompt name, a count, a yes/no).
 * What must never go in: item or recipe names, anything the person typed, photos, location,
 * diet, allergy or health details. `cleanUsageProps` enforces the shape; the list of allowed
 * keys below is what keeps the content safe, so add keys with care.
 */

export const USAGE_EVENT_NAMES = [
  /** The app was opened (or came back after a long break) by a signed-in account. */
  'app_open',
  /** One of Forky's clouds opened by itself. props: prompt */
  'forky_prompt_shown',
  /** The person used the cloud's button (or tapped the scan cloud). props: prompt */
  'forky_prompt_tapped',
  /** The person closed the cloud without using it. props: prompt */
  'forky_prompt_dismissed',
  /** Ask Forky's chat was opened. */
  'ask_forky_opened',
  /** A question was sent to Ask Forky and answered. */
  'ask_forky_asked',
  /** Items from a shelf or receipt scan were saved to the pantry. props: kind, count */
  'scan_saved',
  /** A pantry item was added by hand. */
  'pantry_item_added',
  /** A meal was marked as made. */
  'meal_made',
  /** A meal was put on the week plan. */
  'meal_planned',
  /** Grocery items were added. props: source, count */
  'grocery_items_added',
  /** A grocery item was ticked. */
  'grocery_item_checked',
  /** The last unticked item on a list of three or more was ticked. props: count */
  'grocery_list_completed',
  /** The Plus offer was put in front of the person. props: source */
  'plus_offer_shown',
  /** The person pressed the buy button and was sent to checkout. props: plan */
  'checkout_started',
] as const;

export type UsageEventName = (typeof USAGE_EVENT_NAMES)[number];

const NAME_SET: ReadonlySet<string> = new Set(USAGE_EVENT_NAMES);

/** Only these keys are ever sent. Values are a short code word, a whole number or true/false. */
export const USAGE_PROP_KEYS = ['prompt', 'kind', 'source', 'plan', 'count', 'standalone', 'action'] as const;
export type UsagePropKey = (typeof USAGE_PROP_KEYS)[number];
export type UsageProps = Partial<Record<UsagePropKey, string | number | boolean>>;

const PROP_KEY_SET: ReadonlySet<string> = new Set(USAGE_PROP_KEYS);
/** A code word such as "aisleSort" or "receipt": letters, digits, dash and underscore only. */
const CODE_WORD = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

export function isUsageEventName(name: string): name is UsageEventName {
  return NAME_SET.has(name);
}

/**
 * Keeps only allowed keys with safe values. Free text can never pass: a string must be one short
 * code word, so an item name with a space, or a sentence, is dropped.
 */
export function cleanUsageProps(props: unknown): UsageProps {
  const out: UsageProps = {};
  if (!props || typeof props !== 'object') return out;
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (!PROP_KEY_SET.has(key)) continue;
    if (typeof value === 'boolean') {
      out[key as UsagePropKey] = value;
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key as UsagePropKey] = Math.max(0, Math.min(100_000, Math.round(value)));
    } else if (typeof value === 'string' && CODE_WORD.test(value)) {
      out[key as UsagePropKey] = value;
    }
  }
  return out;
}

export type UsagePlatform = 'web' | 'ios' | 'android';

export interface UsageEventRow {
  name: UsageEventName;
  props: UsageProps;
  session_id: string;
  platform: UsagePlatform;
}

export function buildUsageEventRow(
  name: string,
  props: unknown,
  sessionId: string,
  platform: string,
): UsageEventRow | null {
  if (!isUsageEventName(name)) return null;
  const safePlatform: UsagePlatform = platform === 'ios' || platform === 'android' ? platform : 'web';
  return { name, props: cleanUsageProps(props), session_id: sessionId.slice(0, 40), platform: safePlatform };
}

export const USAGE_LOG_LIMITS = {
  /** Events waiting to be sent. When full, the oldest are dropped: the log is never worth memory. */
  maxQueued: 60,
  /** Rows per request. */
  maxBatch: 30,
  /** Wait this long after the first queued event so a burst of taps goes out as one request. */
  flushDelayMs: 4000,
  /** Away longer than this and coming back counts as a new session and a new `app_open`. */
  newSessionAfterHiddenMs: 30 * 60 * 1000,
} as const;

/** Adds to the queue, dropping the oldest when it is full. Returns the new queue. */
export function enqueueUsageEvent(queue: readonly UsageEventRow[], row: UsageEventRow): UsageEventRow[] {
  const next = [...queue, row];
  return next.length > USAGE_LOG_LIMITS.maxQueued ? next.slice(next.length - USAGE_LOG_LIMITS.maxQueued) : next;
}

/** Splits off the next batch to send. */
export function takeUsageBatch(queue: readonly UsageEventRow[]): { batch: UsageEventRow[]; rest: UsageEventRow[] } {
  return { batch: queue.slice(0, USAGE_LOG_LIMITS.maxBatch), rest: queue.slice(USAGE_LOG_LIMITS.maxBatch) };
}

export type UsageSendOutcome = 'sent' | 'retry' | 'stop';

/**
 * What to do after a send. A missing table or a refused permission means the database side is not
 * in place (or was switched off): stop for this visit so the app does not keep sending requests
 * that cannot succeed. Anything else (offline, a timeout) is worth one more try.
 */
export function usageSendOutcome(error: { code?: string | null; status?: number | null } | null): UsageSendOutcome {
  if (!error) return 'sent';
  const code = error.code ?? '';
  const status = error.status ?? 0;
  if (code === '42P01' || code === 'PGRST205' || code === '42501' || code === '23514' || status === 404 || status === 401 || status === 403) {
    return 'stop';
  }
  return 'retry';
}

/** Whether returning to the app starts a new session. */
export function isNewUsageSession(hiddenAtMs: number | null, nowMs: number): boolean {
  return hiddenAtMs != null && nowMs - hiddenAtMs >= USAGE_LOG_LIMITS.newSessionAfterHiddenMs;
}

/**
 * The grocery list counts as completed when a tick leaves nothing unticked on a list of three or
 * more items. Shorter lists finish too easily to mean a shopping trip.
 */
export function groceryListJustCompleted(
  before: readonly { id: string; checked: boolean }[],
  tickedIds: readonly string[],
): boolean {
  if (before.length < 3 || tickedIds.length === 0) return false;
  const ticked = new Set(tickedIds);
  const hadUnticked = before.some((item) => !item.checked);
  return hadUnticked && before.every((item) => item.checked || ticked.has(item.id));
}
