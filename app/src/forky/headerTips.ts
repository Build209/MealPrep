/**
 * Which short tip Forky shows in the top bar, ported from the old app's overlay
 * (mobile/components/forkinator/ForkinatorOverlay.tsx and lib/forkinator/*):
 *
 * - At most one tip opens by itself per app session.
 * - Greeting first, once per device ("Hey there! The name's Forky McForkface...").
 * - Then food about to expire (today or tomorrow), at most once a day for the same items,
 *   unless the tip is resting (tipBackoff.ts).
 * - Then the scan nudge, at most every 3 days, unless resting. The old app showed it until the
 *   first scan (a device flag). The new app has no such flag, so it shows while the pantry is
 *   empty, which is when a scan helps most.
 * - The old aisle-sort tip is not ported: the new Grocery tab is always sorted by aisle.
 * - A tip folds away after 9 s. Tapping its button counts as used; closing it counts against it;
 *   folding away untouched counts half (the backoff rules).
 *
 * Pure (tests/forky-header-tips.test.ts) except the small storage helpers at the bottom.
 */
import { isExpiringSoon, todayIsoDate } from '../kitchen/expiry';
import {
  FORKY_STORAGE_PREFIX,
  mayShowForkyTip,
  readJson,
  writeJson,
  type ForkyBackoffState,
  type ForkyTipFrequency,
  type TipStore,
} from './tipBackoff';

export type HeaderTipKind = 'greeting' | 'expiration' | 'scanner';

export type HeaderTip =
  | { kind: 'greeting'; message: string }
  | { kind: 'expiration'; message: string; itemIds: string[]; action: { label: string; href: '/pantry' } }
  | { kind: 'scanner'; message: string; action: { label: string; href: '/scan' } };

/** What this device remembers about earlier tips (old app keys, same meaning). */
export type HeaderTipMemory = {
  greetingShown: boolean;
  expirationLastDay: string | null;
  expirationFingerprint: string | null;
  scannerLastShownAt: number | null;
};

export const EMPTY_TIP_MEMORY: HeaderTipMemory = {
  greetingShown: false,
  expirationLastDay: null,
  expirationFingerprint: null,
  scannerLastShownAt: null,
};

export const HEADER_TIP_COPY = {
  greeting: "Hey there! The name's Forky McForkface. I'm here to help.",
  scanner: "Let's see what you're working with. Scan your fridge and I'll find dinner.",
  scannerButton: 'Scan now',
  expirationButton: 'Show me',
  close: 'Close tip',
  openChat: 'Ask Forky',
  reopen: 'Forky has a tip. Tap to see it.',
} as const;

/** A cloud folds away by itself after this long (old app: FORKINATOR_CLOUD_AUTO_COLLAPSE_MS). */
export const TIP_AUTO_FOLD_MS = 9000;
/** Wait after the screen settles before a tip opens (old app: 2 s). */
export const TIP_AUTO_SHOW_DELAY_MS = 2000;
/** Minimum time between scan nudges (old app: FORKINATOR_SCANNER_NUDGE_COOLDOWN_MS). */
export const SCANNER_NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

export function expirationMessage(names: readonly string[]): string {
  const first = names[0]?.trim() || 'Something';
  if (names.length <= 1) return `That ${first} is living on borrowed time! Use it today or tomorrow.`;
  const more = names.length - 1;
  return `That ${first} and ${more} more item${more === 1 ? '' : 's'} are living on borrowed time!`;
}

export function fingerprintIds(ids: readonly string[]): string {
  return [...ids].sort().join('\0');
}

type TipPantryItem = { id: string; name: string; expiresOn: string | null };

/**
 * The tip to open now, or null. `pantry` is null while it is still loading (wait, decide nothing).
 */
export function chooseHeaderTip(input: {
  memory: HeaderTipMemory;
  backoff: ForkyBackoffState;
  frequency: ForkyTipFrequency;
  pantry: readonly TipPantryItem[] | null;
  now: Date;
}): HeaderTip | null {
  const { memory, backoff, frequency, pantry, now } = input;
  if (pantry === null) return null;
  // The greeting is not a tip: it is never held back by the backoff, and it shows only once.
  if (!memory.greetingShown) return { kind: 'greeting', message: HEADER_TIP_COPY.greeting };

  const expiring = pantry.filter((item) => isExpiringSoon(item, 1, now));
  if (expiring.length > 0 && mayShowForkyTip(backoff, 'expiration', now, frequency)) {
    const itemIds = expiring.map((item) => item.id);
    const sameAsToday =
      memory.expirationLastDay === todayIsoDate(now) && memory.expirationFingerprint === fingerprintIds(itemIds);
    if (!sameAsToday) {
      return {
        kind: 'expiration',
        message: expirationMessage(expiring.map((item) => item.name)),
        itemIds,
        action: { label: HEADER_TIP_COPY.expirationButton, href: '/pantry' },
      };
    }
  }

  const nudgeDue = memory.scannerLastShownAt === null || now.getTime() - memory.scannerLastShownAt >= SCANNER_NUDGE_COOLDOWN_MS;
  if (pantry.length === 0 && nudgeDue && mayShowForkyTip(backoff, 'scanner', now, frequency)) {
    return { kind: 'scanner', message: HEADER_TIP_COPY.scanner, action: { label: HEADER_TIP_COPY.scannerButton, href: '/scan' } };
  }
  return null;
}

/** What to remember once a tip has opened. */
export function rememberShown(memory: HeaderTipMemory, tip: HeaderTip, now: Date): HeaderTipMemory {
  if (tip.kind === 'greeting') return { ...memory, greetingShown: true };
  if (tip.kind === 'expiration') {
    return { ...memory, expirationLastDay: todayIsoDate(now), expirationFingerprint: fingerprintIds(tip.itemIds) };
  }
  return { ...memory, scannerLastShownAt: now.getTime() };
}

// ------------------------------------------------------------------------------- device memory

export const TIP_MEMORY_KEYS = {
  greetingShown: `${FORKY_STORAGE_PREFIX}greetingShown`,
  expirationLastDay: `${FORKY_STORAGE_PREFIX}expirationPromptLastShownDay`,
  expirationFingerprint: `${FORKY_STORAGE_PREFIX}expirationPromptLastFingerprint`,
  scannerLastShownAt: `${FORKY_STORAGE_PREFIX}scannerNudgeLastShownAt`,
} as const;

export function readTipMemory(store: TipStore | null): HeaderTipMemory {
  const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  const at = readJson(store, TIP_MEMORY_KEYS.scannerLastShownAt);
  return {
    greetingShown: readJson(store, TIP_MEMORY_KEYS.greetingShown) === true,
    expirationLastDay: text(readJson(store, TIP_MEMORY_KEYS.expirationLastDay)),
    expirationFingerprint: text(readJson(store, TIP_MEMORY_KEYS.expirationFingerprint)),
    scannerLastShownAt: typeof at === 'number' && Number.isFinite(at) ? at : null,
  };
}

export function writeTipMemory(store: TipStore | null, memory: HeaderTipMemory): void {
  writeJson(store, TIP_MEMORY_KEYS.greetingShown, memory.greetingShown);
  if (memory.expirationLastDay) writeJson(store, TIP_MEMORY_KEYS.expirationLastDay, memory.expirationLastDay);
  if (memory.expirationFingerprint) writeJson(store, TIP_MEMORY_KEYS.expirationFingerprint, memory.expirationFingerprint);
  if (memory.scannerLastShownAt !== null) writeJson(store, TIP_MEMORY_KEYS.scannerLastShownAt, memory.scannerLastShownAt);
}

/**
 * Browser automation (Playwright sets navigator.webdriver) gets no tips that open by themselves,
 * so a cloud never shifts the page under another test's tap. A test that wants them sets this key.
 */
export const E2E_TIPS_KEY = 'mealprep.forky.e2eTips';

export function autoTipsAllowedHere(store: TipStore | null): boolean {
  const nav = (globalThis as { navigator?: { webdriver?: boolean } }).navigator;
  if (nav?.webdriver !== true) return true;
  return readJson(store, E2E_TIPS_KEY) === true;
}
