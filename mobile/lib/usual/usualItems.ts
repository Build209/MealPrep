/**
 * Usual items (learning step 2): what this household buys again and again, and roughly how often.
 *
 * Every time something is bought (a grocery row ticked, or an item saved from a receipt scan) the
 * day is noted against that item on this device. Once an item has been bought on three different
 * days, the usual gap between purchases is known, and when that gap has nearly passed the item is
 * offered on the Grocery tab with one tap to add it.
 *
 * Simple on purpose. Published work on grocery data found that a shopper's own purchase counts
 * beat far heavier models, and that timing matters as much as the item: offering something right
 * after it was bought is what people reject. So: counts, the middle gap, and nothing early.
 *
 * Pure rules first (tested by scripts/usual-items-check.ts), device storage at the bottom.
 */
import { PANTRY_CATEGORIES, type PantryCategory } from '../../types/mealprep';
import { normalizeIngredientName } from '../recipeMatch/normalize';
import { readJson, removeStorageKey, writeJson } from '../storage';

export const USUAL_ITEM_RULES = {
  /** Different days an item must have been bought on before it can be called usual. */
  minPurchaseDays: 3,
  /** Purchase days remembered per item (the newest are kept). */
  maxPurchaseDays: 12,
  /** Items remembered per account on this device (least recently bought are dropped). */
  maxItems: 300,
  /** Gaps outside this range are not a shopping habit (daily coffee run, once-a-year spice). */
  minGapDays: 2,
  maxGapDays: 75,
  /** Offer the item once this share of its usual gap has passed since it was last bought. */
  dueAtShareOfGap: 0.85,
  /** Stop offering when it has been this many usual gaps (plus two weeks) since the last purchase. */
  lapsedAfterGaps: 3,
  lapsedGraceDays: 14,
  /** At most this many offers on screen. */
  maxSuggestions: 5,
} as const;

export interface UsualItemRecord {
  /** Name as last bought, for display. */
  name: string;
  unit: string;
  category: PantryCategory;
  /** Quantity last bought, used when adding to the list. */
  quantity: number;
  /** Days bought on (YYYY-MM-DD), oldest first, no repeats. */
  days: string[];
  /** The person said this is not a usual item: never offer it. */
  hidden?: boolean;
}

export type UsualItemHistory = Record<string, UsualItemRecord>;

export interface PurchasedItem {
  name: string;
  unit: string;
  category: PantryCategory;
  quantity: number;
}

export interface UsualSuggestion {
  key: string;
  name: string;
  unit: string;
  category: PantryCategory;
  quantity: number;
  /** The usual number of days between purchases. */
  gapDays: number;
  daysSinceLast: number;
}

export function usualItemKey(name: string): string {
  return normalizeIngredientName(name);
}

export function usualDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map((part) => Number.parseInt(part, 10));
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The usual gap between purchases, in days: the middle gap, so one skipped scan or one early
 * top-up does not move it much. Null until there are enough purchase days.
 */
export function usualGapDays(days: readonly string[]): number | null {
  if (days.length < USUAL_ITEM_RULES.minPurchaseDays) return null;
  const numbers = days.map(dayNumber);
  const gaps: number[] = [];
  for (let i = 1; i < numbers.length; i += 1) gaps.push(numbers[i] - numbers[i - 1]);
  const gap = median(gaps);
  if (gap < USUAL_ITEM_RULES.minGapDays || gap > USUAL_ITEM_RULES.maxGapDays) return null;
  return Math.round(gap);
}

/** Notes that these items were bought on `day`. Returns the new history. */
export function recordPurchases(
  history: UsualItemHistory,
  items: readonly PurchasedItem[],
  day: string,
): UsualItemHistory {
  if (items.length === 0) return history;
  const next: UsualItemHistory = { ...history };
  for (const item of items) {
    const key = usualItemKey(item.name);
    const name = item.name.trim();
    if (!key || !name) continue;
    const existing = next[key];
    const days = existing ? [...existing.days] : [];
    if (!days.includes(day)) days.push(day);
    days.sort();
    next[key] = {
      name: name.slice(0, 80),
      unit: (item.unit || 'each').trim().slice(0, 24) || 'each',
      category: item.category,
      quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      days: days.slice(-USUAL_ITEM_RULES.maxPurchaseDays),
      ...(existing?.hidden ? { hidden: true } : {}),
    };
  }
  return trimHistory(next);
}

/** A tick was taken back on the same day: forget that day for the item. */
export function forgetPurchase(history: UsualItemHistory, name: string, day: string): UsualItemHistory {
  const key = usualItemKey(name);
  const existing = history[key];
  if (!existing || !existing.days.includes(day)) return history;
  const days = existing.days.filter((value) => value !== day);
  const next = { ...history };
  if (days.length === 0 && !existing.hidden) delete next[key];
  else next[key] = { ...existing, days };
  return next;
}

export function hideUsualItem(history: UsualItemHistory, key: string): UsualItemHistory {
  const existing = history[key];
  if (!existing) return history;
  return { ...history, [key]: { ...existing, hidden: true } };
}

function trimHistory(history: UsualItemHistory): UsualItemHistory {
  const keys = Object.keys(history);
  if (keys.length <= USUAL_ITEM_RULES.maxItems) return history;
  const byLastBought = keys.sort((a, b) => {
    const lastA = history[a].days[history[a].days.length - 1] ?? '';
    const lastB = history[b].days[history[b].days.length - 1] ?? '';
    return lastB.localeCompare(lastA);
  });
  const kept: UsualItemHistory = {};
  for (const key of byLastBought.slice(0, USUAL_ITEM_RULES.maxItems)) kept[key] = history[key];
  return kept;
}

/**
 * What to offer today: usual items whose time has nearly come, most overdue first.
 * Never something already on the list, hidden by the person, bought too recently, or long lapsed.
 */
export function usualSuggestions(
  history: UsualItemHistory,
  groceryNames: readonly string[],
  today: string,
): UsualSuggestion[] {
  const onList = new Set(groceryNames.map(usualItemKey));
  const todayNumber = dayNumber(today);
  const due: (UsualSuggestion & { overdue: number })[] = [];
  for (const [key, record] of Object.entries(history)) {
    if (record.hidden || onList.has(key)) continue;
    const gapDays = usualGapDays(record.days);
    if (gapDays == null) continue;
    const daysSinceLast = todayNumber - dayNumber(record.days[record.days.length - 1]);
    if (daysSinceLast < Math.max(1, Math.floor(gapDays * USUAL_ITEM_RULES.dueAtShareOfGap))) continue;
    if (daysSinceLast > gapDays * USUAL_ITEM_RULES.lapsedAfterGaps + USUAL_ITEM_RULES.lapsedGraceDays) continue;
    due.push({
      key,
      name: record.name,
      unit: record.unit,
      category: record.category,
      quantity: record.quantity,
      gapDays,
      daysSinceLast,
      overdue: daysSinceLast / gapDays,
    });
  }
  due.sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
  return due.slice(0, USUAL_ITEM_RULES.maxSuggestions).map(({ overdue: _overdue, ...rest }) => rest);
}

/** The household's steadiest repeat buys, for Ask Forky's profile (names only). */
export function topUsualItemNames(history: UsualItemHistory, limit: number): string[] {
  return Object.values(history)
    .filter((record) => !record.hidden && usualGapDays(record.days) != null)
    .sort((a, b) => b.days.length - a.days.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((record) => record.name);
}

function cleanHistory(raw: unknown): UsualItemHistory {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: UsualItemHistory = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Partial<UsualItemRecord>;
    if (typeof record.name !== 'string' || !Array.isArray(record.days)) continue;
    const days = [...new Set(record.days.filter((day): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
    out[key] = {
      name: record.name,
      unit: typeof record.unit === 'string' && record.unit ? record.unit : 'each',
      category: (PANTRY_CATEGORIES as readonly string[]).includes(record.category as string)
        ? (record.category as PantryCategory)
        : 'dry_goods',
      quantity: typeof record.quantity === 'number' && record.quantity > 0 ? record.quantity : 1,
      days: days.slice(-USUAL_ITEM_RULES.maxPurchaseDays),
      ...(record.hidden === true ? { hidden: true } : {}),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// On this device, per account (or guest). Not sent anywhere.

const STORAGE_PREFIX = 'mealprep.usualItems';
let currentOwnerId = '';
const listeners = new Set<() => void>();

function storageKey(ownerId: string): string {
  return `${STORAGE_PREFIX}.${ownerId || 'guest'}`;
}

/** The app's root says whose kitchen is open (an account id, or the guest id). */
export function setUsualItemsOwner(ownerId: string): void {
  if (ownerId === currentOwnerId) return;
  currentOwnerId = ownerId;
  for (const listener of listeners) listener();
}

export function subscribeUsualItems(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readUsualItemHistory(): UsualItemHistory {
  return cleanHistory(readJson<unknown>(storageKey(currentOwnerId), null));
}

function save(history: UsualItemHistory): void {
  writeJson(storageKey(currentOwnerId), history);
  for (const listener of listeners) listener();
}

export function notePurchasedToday(items: readonly PurchasedItem[], now = new Date()): void {
  if (items.length === 0) return;
  save(recordPurchases(readUsualItemHistory(), items, usualDayKey(now)));
}

export function noteTickTakenBack(name: string, now = new Date()): void {
  const history = readUsualItemHistory();
  const next = forgetPurchase(history, name, usualDayKey(now));
  if (next !== history) save(next);
}

export function hideUsualItemForGood(key: string): void {
  save(hideUsualItem(readUsualItemHistory(), key));
}

export function readUsualSuggestions(groceryNames: readonly string[], now = new Date()): UsualSuggestion[] {
  return usualSuggestions(readUsualItemHistory(), groceryNames, usualDayKey(now));
}

/** Sign-out clears the account's purchase memory from this device. */
export function clearUsualItemsForOwner(ownerId: string): void {
  removeStorageKey(storageKey(ownerId));
}
