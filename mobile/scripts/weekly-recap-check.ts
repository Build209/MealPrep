/**
 * Weekly recap (learning step 5): the person's own counts for the week and a forgiving streak.
 * Run: npm run test:weekly-recap
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWeeklyRecap,
  isActiveKitchenWeek,
  kitchenStreakWeeks,
  parseKitchenWeeks,
  recapPhrases,
  weekStartOf,
  WEEKLY_RECAP_COPY,
  type KitchenWeek,
} from '../lib/recap/weeklyRecap.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8');
const week = (weekStart: string, counts: Partial<KitchenWeek> = { mealsMade: 1 }): KitchenWeek => ({
  weekStart,
  mealsMade: 0,
  itemsScanned: 0,
  listsCompleted: 0,
  itemsTicked: 0,
  mealsPlanned: 0,
  ...counts,
});

// --- Weeks start on Monday by the device's calendar.
assert.equal(weekStartOf(new Date(2026, 9, 11, 23, 30)), '2026-10-05', 'Sunday night belongs to the week that began Monday');
assert.equal(weekStartOf(new Date(2026, 9, 12, 0, 5)), '2026-10-12', 'Monday starts a new week');
assert.equal(weekStartOf(new Date(2026, 9, 7, 12, 0)), '2026-10-05');
assert.equal(weekStartOf(new Date(2026, 0, 1, 12, 0)), '2025-12-29', 'across a year end');

// --- Database rows are read defensively.
assert.deepEqual(
  parseKitchenWeeks([
    { week_start: '2026-09-28', meals_made: 1, items_scanned: '0', lists_completed: null, items_ticked: -3, meals_planned: 2.9 },
    { week_start: '2026-10-05T00:00:00', meals_made: '2', items_scanned: 14, lists_completed: 1, items_ticked: 5, meals_planned: 0 },
    { week_start: 'soon', meals_made: 9 },
    null,
    'junk',
  ]),
  [
    week('2026-10-05', { mealsMade: 2, itemsScanned: 14, listsCompleted: 1, itemsTicked: 5 }),
    week('2026-09-28', { mealsMade: 1, mealsPlanned: 2 }),
  ],
);
assert.deepEqual(parseKitchenWeeks(null), []);
assert.deepEqual(parseKitchenWeeks({ week_start: '2026-10-05' }), []);

// --- Wording: counts of the person's own actions, singular and plural, at most three.
assert.deepEqual(recapPhrases(week('2026-10-05', { mealsMade: 1, itemsScanned: 14, listsCompleted: 1, itemsTicked: 9, mealsPlanned: 3 })), [
  '1 meal made',
  '14 items scanned in',
  '1 shopping list finished',
]);
assert.deepEqual(recapPhrases(week('2026-10-05', { mealsMade: 0, itemsTicked: 1, mealsPlanned: 2 })), ['1 item ticked off', '2 meals planned']);
assert.deepEqual(recapPhrases(week('2026-10-05', { mealsMade: 0 })), []);
const everyPhrase = [
  ...recapPhrases(week('x', { mealsMade: 2, itemsScanned: 2, listsCompleted: 2 })),
  ...recapPhrases(week('x', { mealsMade: 0, itemsTicked: 2, mealsPlanned: 2 })),
  ...Object.values(WEEKLY_RECAP_COPY).map((value) => (typeof value === 'function' ? value(3) : value)),
].join(' ');
assert.doesNotMatch(everyPhrase, /\$|\bsav(e|ed|ing|ings)\b|\bmoney\b|\bworth\b/i, 'no money or savings claims');

// --- Streak: weeks in a row, one missed week forgiven, two end it.
assert.equal(isActiveKitchenWeek(week('x', { mealsMade: 0 })), false);
assert.equal(isActiveKitchenWeek(undefined), false);
const now = '2026-10-05';
assert.equal(kitchenStreakWeeks([], now), 0);
assert.equal(kitchenStreakWeeks([week('2026-10-05')], now), 1);
assert.equal(kitchenStreakWeeks([week('2026-10-05'), week('2026-09-28'), week('2026-09-21')], now), 3);
// Monday morning, nothing yet this week: last week still counts.
assert.equal(kitchenStreakWeeks([week('2026-09-28'), week('2026-09-21')], now), 2);
// One missed week in the middle is forgiven and not counted.
assert.equal(kitchenStreakWeeks([week('2026-10-05'), week('2026-09-21'), week('2026-09-14')], now), 3);
// Two missed weeks in a row end it.
assert.equal(kitchenStreakWeeks([week('2026-10-05'), week('2026-09-14'), week('2026-09-07')], now), 1);
// Nothing this week or last: no streak, whatever came before.
assert.equal(kitchenStreakWeeks([week('2026-09-21'), week('2026-09-14')], now), 0);
// A week with rows but nothing done does not count.
assert.equal(kitchenStreakWeeks([week('2026-10-05'), week('2026-09-28', { mealsMade: 0 }), week('2026-09-21', { mealsMade: 0 })], now), 1);

// --- What shows: this week once active, otherwise last week, otherwise nothing.
const wednesday = new Date(2026, 9, 7, 12, 0);
assert.equal(buildWeeklyRecap([], wednesday), null);
assert.equal(buildWeeklyRecap([week('2026-09-07')], wednesday), null, 'old activity alone shows nothing');
assert.deepEqual(buildWeeklyRecap([week('2026-10-05', { mealsMade: 2 })], wednesday), {
  weekStart: '2026-10-05',
  title: 'This week in your kitchen',
  phrases: ['2 meals made'],
  streakLine: null,
});
assert.deepEqual(buildWeeklyRecap([week('2026-09-28', { itemsScanned: 30 }), week('2026-09-21')], wednesday), {
  weekStart: '2026-09-28',
  title: 'Last week in your kitchen',
  phrases: ['30 items scanned in'],
  streakLine: '2 weeks in a row',
});
assert.equal(
  buildWeeklyRecap([week('2026-10-05'), week('2026-09-28'), week('2026-09-21')], wednesday)?.streakLine,
  '3 weeks in a row',
);

// --- The card: signed-in only, silent on any failure, closable for the week.
const card = read('components/home/WeeklyRecapCard.tsx');
assert.match(card, /if \(!userId \|\| demoMode\) \{/, 'guests and demo mode see no card');
assert.match(card, /supabase\.rpc\('my_kitchen_weeks'/);
assert.match(card, /if \(cancelled \|\| error\) return;/, 'a missing function shows nothing');
assert.doesNotMatch(card, /console\.|setError|Alert\./, 'never an error on screen');
assert.match(card, /dismissedWeek === thisWeek\) return null;/);
assert.match(card, /h-11 w-11/, 'the close button is 44px');
assert.match(read('app/(tabs)/index.tsx'), /<WeeklyRecapCard \/>/);

// --- The database function: the caller's own rows, counts only, signed-in only.
const sql = read('supabase/migrations/20261011080000_my_kitchen_weeks.sql');
assert.match(sql, /security invoker/, 'runs with the caller\'s rights, so row level security applies');
assert.match(sql, /where e\.user_id = \(select auth\.uid\(\)\)/);
assert.match(sql, /revoke all on function public\.my_kitchen_weeks\(text, integer\) from public, anon;/);
assert.match(sql, /grant execute on function public\.my_kitchen_weeks\(text, integer\) to authenticated;/);
assert.doesNotMatch(sql, /security definer/);
for (const column of ['week_start', 'meals_made', 'items_scanned', 'lists_completed', 'items_ticked', 'meals_planned']) {
  assert.match(sql, new RegExp(`\\b${column}\\b`), `${column} is returned`);
}

console.log('weekly-recap-check: ok');
