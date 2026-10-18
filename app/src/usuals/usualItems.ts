/**
 * "Your usuals": which items a person buys on a rhythm and is probably due for. Pure (no network,
 * no screen code), so tests/usuals.test.ts runs it.
 *
 * Input is the person's own purchase days (db: public.purchase_history, written by a trigger when
 * a grocery row is ticked) and their own choices (public.usual_item_settings). Plain arithmetic,
 * no model:
 *   - An item needs at least MIN_PURCHASE_DAYS different purchase days to count as a usual.
 *   - Its usual gap is the MEDIAN gap between purchase days (a missed day stretches one gap, not
 *     the middle one).
 *   - It is offered once DUE_FRACTION of that gap has passed since the last purchase, and stops
 *     being offered after STALE_MULTIPLE gaps (the habit probably ended).
 *   - Not offered when hidden for good, snoozed, or already open on the grocery list.
 * The thresholds are starting choices from the learning research, not measured values.
 */

export const MIN_PURCHASE_DAYS = 3;
export const DUE_FRACTION = 0.85;
export const STALE_MULTIPLE = 4;
/** A usual faster than this is a daily habit, not a shopping item. */
export const MIN_GAP_DAYS = 2;
export const MAX_OFFERED = 5;
/** "Not now" hides an item for this many days. */
export const SNOOZE_DAYS = 14;

export type PurchaseDay = { nameKey: string; name: string; boughtOn: string }; // boughtOn: YYYY-MM-DD
export type UsualSetting = { nameKey: string; hidden: boolean; snoozedUntil: string | null };

export type UsualItem = {
  nameKey: string;
  name: string;
  /** Median days between purchases. */
  gapDays: number;
  daysSince: number;
  /** How many purchase days it is based on. */
  purchaseDays: number;
};

/** Same rule as the database's public.usual_key: lower case, spaces collapsed. */
export function usualKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

const DAY_MS = 86_400_000;

/** Whole days between two YYYY-MM-DD dates (b minus a), calendar days, no time zone surprises. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  if (![ay, am, ad, by, bm, bd].every(Number.isFinite)) return Number.NaN;
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / DAY_MS);
}

/** Today as YYYY-MM-DD in the device's own calendar. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysKey(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type UsualsInput = {
  purchases: readonly PurchaseDay[];
  settings: readonly UsualSetting[];
  /** Names of grocery rows that are still open (not ticked). */
  openListNames: readonly string[];
  today: string;
};

/** The usuals due now, most overdue first, at most MAX_OFFERED. */
export function dueUsuals({ purchases, settings, openListNames, today }: UsualsInput): UsualItem[] {
  const open = new Set(openListNames.map(usualKey));
  const blocked = new Map(settings.map((s) => [s.nameKey, s]));

  const byKey = new Map<string, { name: string; latestDay: string; days: Set<string> }>();
  for (const p of purchases) {
    if (!p.nameKey || !/^\d{4}-\d{2}-\d{2}$/.test(p.boughtOn)) continue;
    const entry = byKey.get(p.nameKey) ?? { name: p.name, latestDay: p.boughtOn, days: new Set<string>() };
    // Show the spelling from the most recent purchase.
    if (p.boughtOn >= entry.latestDay) {
      entry.name = p.name;
      entry.latestDay = p.boughtOn;
    }
    entry.days.add(p.boughtOn);
    byKey.set(p.nameKey, entry);
  }

  const out: (UsualItem & { ratio: number })[] = [];
  for (const [nameKey, entry] of byKey) {
    if (entry.days.size < MIN_PURCHASE_DAYS) continue;
    if (open.has(nameKey)) continue;
    const setting = blocked.get(nameKey);
    if (setting?.hidden) continue;
    if (setting?.snoozedUntil && setting.snoozedUntil > today) continue;

    const days = [...entry.days].sort();
    const gaps: number[] = [];
    for (let i = 1; i < days.length; i++) gaps.push(daysBetween(days[i - 1]!, days[i]!));
    const gap = median([...gaps].sort((a, b) => a - b));
    if (!Number.isFinite(gap) || gap < MIN_GAP_DAYS) continue;

    const since = daysBetween(days[days.length - 1]!, today);
    if (!Number.isFinite(since) || since < gap * DUE_FRACTION || since > gap * STALE_MULTIPLE) continue;

    out.push({ nameKey, name: entry.name, gapDays: gap, daysSince: since, purchaseDays: days.length, ratio: since / gap });
  }

  return out
    .sort((a, b) => b.ratio - a.ratio || a.nameKey.localeCompare(b.nameKey))
    .slice(0, MAX_OFFERED)
    .map(({ ratio: _ratio, ...item }) => item);
}
