/**
 * Forky learns when a tip is not wanted (learning step 3).
 *
 * Each of his three unprompted tips (food about to expire, sort the list by aisle, scan your
 * kitchen) keeps a small score on this device. Closing a tip without using it counts 2, letting it
 * fold away untouched counts 1, and using it wipes the score. At 4 the tip rests: a week the first
 * time, then two weeks, then four. The expiring-food tip rests for less time, because missing it
 * costs the person food.
 *
 * The person can also choose how often Forky speaks up: normal, less often, or off.
 *
 * Pure rules first (tested by scripts/forky-tip-backoff-check.ts), storage at the bottom.
 * The restock notice ("I added eggs to your list") is not a tip: it reports something Forky just
 * did and carries the Undo, so it always shows.
 */
import { readJson, writeJson } from '../storage';

export const FORKY_BACKOFF_TIPS = ['expiration', 'aisleSort', 'scanner'] as const;
export type ForkyBackoffTip = (typeof FORKY_BACKOFF_TIPS)[number];

export const FORKY_TIP_FREQUENCIES = ['normal', 'less', 'off'] as const;
export type ForkyTipFrequency = (typeof FORKY_TIP_FREQUENCIES)[number];

export type ForkyTipOutcome = 'tapped' | 'dismissed';

export interface ForkyTipState {
  /** Unwanted-tip score since the last time the tip was used. */
  score: number;
  /** How many times in a row this tip has been rested (0 to 3). */
  level: number;
  /** Day (YYYY-MM-DD) the tip may show again, or null. */
  restUntilDay: string | null;
  /** True between a tip opening and the person tapping or closing it. */
  awaitingOutcome: boolean;
}

export interface ForkyBackoffState {
  tips: Partial<Record<ForkyBackoffTip, ForkyTipState>>;
  /** Day any unprompted tip last opened (for "less often"). */
  lastTipDay: string | null;
}

export const FORKY_BACKOFF_RULES = {
  dismissedScore: 2,
  ignoredScore: 1,
  restAtScore: 4,
  maxLevel: 3,
  /** Rest length in days by level (index 0 = first rest). */
  restDays: [7, 14, 28],
  expirationRestDays: [3, 7, 14],
  /** "Less often": rests last twice as long and tips are at least this many days apart. */
  lessOftenRestMultiplier: 2,
  lessOftenMinGapDays: 3,
} as const;

export const EMPTY_FORKY_BACKOFF: ForkyBackoffState = { tips: {}, lastTipDay: null };
const EMPTY_TIP: ForkyTipState = { score: 0, level: 0, restUntilDay: null, awaitingOutcome: false };

export function isForkyBackoffTip(kind: string): kind is ForkyBackoffTip {
  return (FORKY_BACKOFF_TIPS as readonly string[]).includes(kind);
}

export function isForkyTipFrequency(value: unknown): value is ForkyTipFrequency {
  return typeof value === 'string' && (FORKY_TIP_FREQUENCIES as readonly string[]).includes(value);
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

function daysBetween(fromDay: string, toDay: string): number {
  const parse = (day: string) => {
    const [y, m, d] = day.split('-').map((part) => Number.parseInt(part, 10));
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toDay) - parse(fromDay)) / 86_400_000);
}

function tipOf(state: ForkyBackoffState, tip: ForkyBackoffTip): ForkyTipState {
  return { ...EMPTY_TIP, ...(state.tips[tip] ?? {}) };
}

function withTip(state: ForkyBackoffState, tip: ForkyBackoffTip, next: ForkyTipState): ForkyBackoffState {
  return { ...state, tips: { ...state.tips, [tip]: next } };
}

export function forkyRestDays(tip: ForkyBackoffTip, level: number, frequency: ForkyTipFrequency): number {
  const table = tip === 'expiration' ? FORKY_BACKOFF_RULES.expirationRestDays : FORKY_BACKOFF_RULES.restDays;
  const index = Math.max(0, Math.min(table.length - 1, level - 1));
  return table[index] * (frequency === 'less' ? FORKY_BACKOFF_RULES.lessOftenRestMultiplier : 1);
}

/** Adds to the score and, once it reaches the limit, starts a rest. */
function addScore(
  state: ForkyBackoffState,
  tip: ForkyBackoffTip,
  points: number,
  now: Date,
  frequency: ForkyTipFrequency,
): ForkyBackoffState {
  const current = tipOf(state, tip);
  const score = current.score + points;
  if (score < FORKY_BACKOFF_RULES.restAtScore) {
    return withTip(state, tip, { ...current, score, awaitingOutcome: false });
  }
  const level = Math.min(current.level + 1, FORKY_BACKOFF_RULES.maxLevel);
  return withTip(state, tip, {
    score: 0,
    level,
    restUntilDay: addDays(dayKey(now), forkyRestDays(tip, level, frequency)),
    awaitingOutcome: false,
  });
}

/**
 * A tip opened by itself. If the last time it opened nobody touched it, that counts against it
 * first. Returns the new state.
 */
export function forkyTipShown(
  state: ForkyBackoffState,
  tip: ForkyBackoffTip,
  now: Date,
  frequency: ForkyTipFrequency,
): ForkyBackoffState {
  let next = state;
  if (tipOf(next, tip).awaitingOutcome) {
    next = addScore(next, tip, FORKY_BACKOFF_RULES.ignoredScore, now, frequency);
  }
  const current = tipOf(next, tip);
  return { ...withTip(next, tip, { ...current, awaitingOutcome: true }), lastTipDay: dayKey(now) };
}

/** The person used the tip's button, or closed it. */
export function forkyTipOutcome(
  state: ForkyBackoffState,
  tip: ForkyBackoffTip,
  outcome: ForkyTipOutcome,
  now: Date,
  frequency: ForkyTipFrequency,
): ForkyBackoffState {
  if (outcome === 'tapped') {
    // Wanted: forget everything held against it.
    return withTip(state, tip, { ...EMPTY_TIP });
  }
  return addScore(state, tip, FORKY_BACKOFF_RULES.dismissedScore, now, frequency);
}

export function isForkyTipResting(state: ForkyBackoffState, tip: ForkyBackoffTip, now: Date): boolean {
  const until = tipOf(state, tip).restUntilDay;
  return until != null && dayKey(now) < until;
}

/** Whether Forky may open this tip by himself right now. */
export function mayShowForkyTip(
  state: ForkyBackoffState,
  tip: ForkyBackoffTip,
  now: Date,
  frequency: ForkyTipFrequency,
): boolean {
  if (frequency === 'off') return false;
  if (isForkyTipResting(state, tip, now)) return false;
  // Food about to expire is the one tip worth an exception: it still rests when closed, but the
  // "less often" gap does not hold it back.
  if (frequency === 'less' && tip !== 'expiration' && state.lastTipDay) {
    if (daysBetween(state.lastTipDay, dayKey(now)) < FORKY_BACKOFF_RULES.lessOftenMinGapDays) return false;
  }
  return true;
}

function cleanState(raw: unknown): ForkyBackoffState {
  if (!raw || typeof raw !== 'object') return EMPTY_FORKY_BACKOFF;
  const source = raw as { tips?: Record<string, Partial<ForkyTipState>>; lastTipDay?: unknown };
  const tips: ForkyBackoffState['tips'] = {};
  const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  for (const tip of FORKY_BACKOFF_TIPS) {
    const entry = source.tips?.[tip];
    if (!entry || typeof entry !== 'object') continue;
    tips[tip] = {
      score: Number.isFinite(entry.score) ? Math.max(0, Math.min(10, Math.floor(entry.score as number))) : 0,
      level: Number.isFinite(entry.level)
        ? Math.max(0, Math.min(FORKY_BACKOFF_RULES.maxLevel, Math.floor(entry.level as number)))
        : 0,
      restUntilDay: isDay(entry.restUntilDay) ? entry.restUntilDay : null,
      awaitingOutcome: entry.awaitingOutcome === true,
    };
  }
  return { tips, lastTipDay: isDay(source.lastTipDay) ? source.lastTipDay : null };
}

// ---------------------------------------------------------------------------------------------
// On this device. The score sits under Forky's storage prefix, so "Reset Forky tips" clears it.
// The frequency choice is a setting, not a tip memory, so it sits outside that prefix and stays.

export const FORKY_TIP_BACKOFF_STORAGE_KEY = 'mealprep.forkinator.tipBackoff';
export const FORKY_TIP_FREQUENCY_STORAGE_KEY = 'mealprep.forkyTipFrequency';

export function readForkyBackoff(): ForkyBackoffState {
  return cleanState(readJson<unknown>(FORKY_TIP_BACKOFF_STORAGE_KEY, null));
}

export function readForkyTipFrequency(): ForkyTipFrequency {
  const raw = readJson<unknown>(FORKY_TIP_FREQUENCY_STORAGE_KEY, null);
  return isForkyTipFrequency(raw) ? raw : 'normal';
}

export function writeForkyTipFrequency(frequency: ForkyTipFrequency): void {
  writeJson(FORKY_TIP_FREQUENCY_STORAGE_KEY, frequency);
}

/** May Forky open this tip by himself now? Kinds that are not tips (greeting, restock) always may. */
export function forkyTipAllowed(kind: string, now = new Date()): boolean {
  if (!isForkyBackoffTip(kind)) return true;
  return mayShowForkyTip(readForkyBackoff(), kind, now, readForkyTipFrequency());
}

export function recordForkyTipShown(kind: string, now = new Date()): void {
  if (!isForkyBackoffTip(kind)) return;
  writeJson(FORKY_TIP_BACKOFF_STORAGE_KEY, forkyTipShown(readForkyBackoff(), kind, now, readForkyTipFrequency()));
}

export function recordForkyTipOutcome(kind: string, outcome: ForkyTipOutcome, now = new Date()): void {
  if (!isForkyBackoffTip(kind)) return;
  writeJson(
    FORKY_TIP_BACKOFF_STORAGE_KEY,
    forkyTipOutcome(readForkyBackoff(), kind, outcome, now, readForkyTipFrequency()),
  );
}
