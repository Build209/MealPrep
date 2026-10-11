/**
 * Weekly recap (learning step 5): "This week in your kitchen", in counts.
 *
 * The numbers come from the person's own usage-log rows, counted per week by the database
 * function `my_kitchen_weeks`. This file holds the pure rules: which week is which, the streak,
 * and the wording. Tested by scripts/weekly-recap-check.ts.
 *
 * Wording rules (research, 2026-10-10): counts of the person's own actions only. No dollar
 * amounts and no "saved" claims: the app holds no prices, and a savings figure it cannot back up
 * is the risky kind of advertising claim.
 */

export interface KitchenWeek {
  /** Monday of the week, YYYY-MM-DD, in the person's time zone. */
  weekStart: string;
  mealsMade: number;
  itemsScanned: number;
  listsCompleted: number;
  itemsTicked: number;
  mealsPlanned: number;
}

export const WEEKLY_RECAP_RULES = {
  /** Weeks of history asked for. */
  weeksFetched: 8,
  /** The streak is worth a line from this many weeks. */
  minStreakToShow: 2,
  /** One missed week does not break the streak; two in a row do. */
  forgivenGapWeeks: 1,
} as const;

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Reads the database rows defensively: anything odd becomes zero or is dropped. */
export function parseKitchenWeeks(rows: unknown): KitchenWeek[] {
  if (!Array.isArray(rows)) return [];
  const weeks: KitchenWeek[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const source = row as Record<string, unknown>;
    const weekStart = typeof source.week_start === 'string' ? source.week_start.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) continue;
    weeks.push({
      weekStart,
      mealsMade: toNumber(source.meals_made),
      itemsScanned: toNumber(source.items_scanned),
      listsCompleted: toNumber(source.lists_completed),
      itemsTicked: toNumber(source.items_ticked),
      mealsPlanned: toNumber(source.meals_planned),
    });
  }
  return weeks.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

/** Monday of the week `date` falls in, by the device's calendar. */
export function weekStartOf(date: Date): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - sinceMonday);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftWeeks(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + weeks * 7);
  return weekStartOf(date);
}

/** A week counts when the kitchen was actually used: cooking, scanning, shopping or planning. */
export function isActiveKitchenWeek(week: KitchenWeek | undefined): boolean {
  if (!week) return false;
  return week.mealsMade + week.itemsScanned + week.listsCompleted + week.itemsTicked + week.mealsPlanned > 0;
}

/**
 * Weeks in a row the kitchen was used, counting back from this week (or from last week when this
 * week has not started yet, so Monday morning does not read as a broken streak). One missed week
 * in between is forgiven and not counted; two missed weeks end it.
 */
export function kitchenStreakWeeks(weeks: readonly KitchenWeek[], thisWeekStart: string): number {
  const active = new Set(weeks.filter(isActiveKitchenWeek).map((week) => week.weekStart));
  let cursor = thisWeekStart;
  if (!active.has(cursor)) cursor = shiftWeeks(cursor, -1);
  if (!active.has(cursor)) return 0;
  let streak = 0;
  let gap = 0;
  // Bounded by the history asked for; the loop cannot run away.
  for (let i = 0; i < 60; i += 1) {
    if (active.has(cursor)) {
      streak += 1;
      gap = 0;
    } else {
      gap += 1;
      if (gap > WEEKLY_RECAP_RULES.forgivenGapWeeks) break;
    }
    cursor = shiftWeeks(cursor, -1);
  }
  return streak;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The week's counts as short phrases, most meaningful first. At most three. */
export function recapPhrases(week: KitchenWeek): string[] {
  const phrases: string[] = [];
  if (week.mealsMade > 0) phrases.push(plural(week.mealsMade, 'meal made', 'meals made'));
  if (week.itemsScanned > 0) phrases.push(plural(week.itemsScanned, 'item scanned in', 'items scanned in'));
  if (week.listsCompleted > 0) phrases.push(plural(week.listsCompleted, 'shopping list finished', 'shopping lists finished'));
  if (week.itemsTicked > 0 && week.listsCompleted === 0) {
    phrases.push(plural(week.itemsTicked, 'item ticked off', 'items ticked off'));
  }
  if (week.mealsPlanned > 0) phrases.push(plural(week.mealsPlanned, 'meal planned', 'meals planned'));
  return phrases.slice(0, 3);
}

export interface WeeklyRecap {
  /** Which week the phrases describe. */
  weekStart: string;
  title: string;
  phrases: string[];
  /** For example "3 weeks in a row", or null when there is no streak worth a line. */
  streakLine: string | null;
}

export const WEEKLY_RECAP_COPY = {
  thisWeekTitle: 'This week in your kitchen',
  lastWeekTitle: 'Last week in your kitchen',
  streak: (weeks: number) => `${weeks} weeks in a row`,
  dismissA11y: 'Hide this recap until next week',
} as const;

/**
 * What to show today, or null for nothing. This week once it has activity; otherwise last week
 * (so the card is not blank on a Monday). Nothing at all for a kitchen with no recent activity.
 */
export function buildWeeklyRecap(weeks: readonly KitchenWeek[], now: Date): WeeklyRecap | null {
  const thisWeekStart = weekStartOf(now);
  const byStart = new Map(weeks.map((week) => [week.weekStart, week]));
  const thisWeek = byStart.get(thisWeekStart);
  const lastWeek = byStart.get(shiftWeeks(thisWeekStart, -1));
  const streak = kitchenStreakWeeks(weeks, thisWeekStart);
  const streakLine = streak >= WEEKLY_RECAP_RULES.minStreakToShow ? WEEKLY_RECAP_COPY.streak(streak) : null;
  if (isActiveKitchenWeek(thisWeek) && thisWeek) {
    return { weekStart: thisWeekStart, title: WEEKLY_RECAP_COPY.thisWeekTitle, phrases: recapPhrases(thisWeek), streakLine };
  }
  if (isActiveKitchenWeek(lastWeek) && lastWeek) {
    return { weekStart: lastWeek.weekStart, title: WEEKLY_RECAP_COPY.lastWeekTitle, phrases: recapPhrases(lastWeek), streakLine };
  }
  return null;
}

/** Device key for "hidden until next week": tied to the week the card was closed in. */
export const WEEKLY_RECAP_DISMISSED_WEEK_KEY = 'mealprep.weeklyRecap.dismissedWeek';
