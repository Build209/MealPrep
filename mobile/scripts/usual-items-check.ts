/**
 * "Your usuals" (learning step 2): learn what a household buys regularly from its own ticks and
 * receipts, and offer it when its usual time has nearly come. Run: npm run test:usual-items
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROCERY_COPY } from '../config/grocery.ts';
import {
  clearUsualItemsForOwner,
  forgetPurchase,
  hideUsualItem,
  hideUsualItemForGood,
  notePurchasedToday,
  noteTickTakenBack,
  readUsualItemHistory,
  readUsualSuggestions,
  recordPurchases,
  setUsualItemsOwner,
  topUsualItemNames,
  USUAL_ITEM_RULES,
  usualGapDays,
  usualItemKey,
  usualSuggestions,
  type PurchasedItem,
  type UsualItemHistory,
} from '../lib/usual/usualItems.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8');

const eggs: PurchasedItem = { name: 'Eggs', unit: 'dozen', category: 'dairy', quantity: 1 };
const milk: PurchasedItem = { name: 'Whole milk', unit: 'gal', category: 'dairy', quantity: 1 };
const saffron: PurchasedItem = { name: 'Saffron', unit: 'jar', category: 'spices', quantity: 1 };
const buy = (history: UsualItemHistory, item: PurchasedItem, ...days: string[]) =>
  days.reduce((acc, day) => recordPurchases(acc, [item], day), history);

// --- The usual gap is the middle gap, known only after three different purchase days.
assert.equal(usualGapDays(['2026-09-01', '2026-09-10']), null, 'two purchases are not a habit yet');
assert.equal(usualGapDays(['2026-09-01', '2026-09-10', '2026-09-19']), 9);
// One long gap (a missed receipt scan) does not move the middle.
assert.equal(usualGapDays(['2026-08-01', '2026-08-08', '2026-08-15', '2026-09-12', '2026-09-19']), 7);
assert.equal(usualGapDays(['2026-09-01', '2026-09-02', '2026-09-03']), null, 'daily is not a shopping habit');
assert.equal(usualGapDays(['2025-01-01', '2025-06-01', '2025-11-01']), null, 'twice a year is not either');

// --- Recording: same day twice counts once, names differing only in case and spacing are one item.
let history: UsualItemHistory = {};
history = buy(history, eggs, '2026-09-01', '2026-09-01', '2026-09-10', '2026-09-19');
const respelled = recordPurchases(history, [{ ...eggs, name: '  eggs ' }], '2026-09-19');
assert.deepEqual(Object.keys(respelled), [usualItemKey('Eggs')]);
assert.deepEqual(respelled[usualItemKey('Eggs')].days, ['2026-09-01', '2026-09-10', '2026-09-19']);
assert.equal(respelled[usualItemKey('Eggs')].name, 'eggs', 'shown as last bought');
// Only the newest purchase days are kept.
let long: UsualItemHistory = {};
for (let i = 1; i <= 20; i += 1) long = recordPurchases(long, [eggs], `2026-01-${String(i).padStart(2, '0')}`);
assert.equal(long[usualItemKey('Eggs')].days.length, USUAL_ITEM_RULES.maxPurchaseDays);
assert.equal(long[usualItemKey('Eggs')].days.at(-1), '2026-01-20');
assert.deepEqual(recordPurchases(history, [{ ...eggs, name: '   ' }], '2026-09-20'), history, 'blank names are ignored');

// --- Offers: not right after buying, yes when the time has nearly come, most overdue first.
assert.deepEqual(usualSuggestions(history, [], '2026-09-20'), [], 'never the day after buying');
assert.deepEqual(usualSuggestions(history, [], '2026-09-25'), [], 'six days into a nine-day habit is too early');
const due = usualSuggestions(history, [], '2026-09-27');
assert.equal(due.length, 1);
assert.deepEqual(
  { name: due[0].name, unit: due[0].unit, quantity: due[0].quantity, gapDays: due[0].gapDays, daysSinceLast: due[0].daysSinceLast },
  { name: 'Eggs', unit: 'dozen', quantity: 1, gapDays: 9, daysSinceLast: 8 },
);
// Already on the list (ticked or not, any spelling): not offered.
assert.deepEqual(usualSuggestions(history, ['EGGS'], '2026-09-27'), []);
// Long lapsed: stopped buying it, stop offering it. 9 x 3 + 14 = 41 days.
assert.equal(usualSuggestions(history, [], '2026-10-30').length, 1);
assert.deepEqual(usualSuggestions(history, [], '2026-10-31'), []);
// Hidden by the person: never offered again, even after more purchases.
let hidden = hideUsualItem(history, usualItemKey('Eggs'));
hidden = recordPurchases(hidden, [eggs], '2026-09-28');
assert.deepEqual(usualSuggestions(hidden, [], '2026-10-07'), []);
// Two due items: the more overdue one first; a one-off purchase never appears.
let two = buy(history, milk, '2026-09-05', '2026-09-12', '2026-09-19');
two = buy(two, saffron, '2026-09-19');
assert.deepEqual(usualSuggestions(two, [], '2026-09-30').map((item) => item.name), ['Whole milk', 'Eggs']);
// Never more than the limit on screen.
let many: UsualItemHistory = {};
for (const name of ['Bread', 'Butter', 'Bananas', 'Rice', 'Coffee', 'Yogurt', 'Onions', 'Tortillas', 'Cheddar cheese']) {
  many = buy(many, { ...eggs, name }, '2026-09-01', '2026-09-08', '2026-09-15');
}
assert.equal(Object.keys(many).length, 9);
assert.equal(usualSuggestions(many, [], '2026-09-22').length, USUAL_ITEM_RULES.maxSuggestions);

// --- A tick taken back the same day is forgotten; an earlier day is kept.
const undone = forgetPurchase(history, 'eggs', '2026-09-19');
assert.deepEqual(undone[usualItemKey('Eggs')].days, ['2026-09-01', '2026-09-10']);
assert.equal(forgetPurchase(history, 'eggs', '2026-09-20'), history);
assert.deepEqual(forgetPurchase(buy({}, saffron, '2026-09-19'), 'Saffron', '2026-09-19'), {});

// --- Names for Ask Forky: steady habits only, most-bought first.
assert.deepEqual(topUsualItemNames(two, 5), ['Eggs', 'Whole milk']);
assert.deepEqual(topUsualItemNames(hidden, 5), []);

// --- On the device: kept per kitchen, cleared on sign-out, and the card's wording.
setUsualItemsOwner('user-a');
for (const day of ['2026-09-01', '2026-09-10', '2026-09-19']) notePurchasedToday([eggs], new Date(`${day}T12:00:00`));
assert.equal(readUsualSuggestions([], new Date('2026-09-27T12:00:00')).length, 1);
notePurchasedToday([milk], new Date('2026-09-27T12:00:00'));
noteTickTakenBack('Whole milk', new Date('2026-09-27T12:00:00'));
assert.deepEqual(Object.keys(readUsualItemHistory()), [usualItemKey('Eggs')]);
setUsualItemsOwner('user-b');
assert.deepEqual(readUsualItemHistory(), {}, 'another kitchen on the same device sees nothing');
setUsualItemsOwner('user-a');
hideUsualItemForGood(usualItemKey('Eggs'));
assert.deepEqual(readUsualSuggestions([], new Date('2026-09-27T12:00:00')), []);
clearUsualItemsForOwner('user-a');
assert.deepEqual(readUsualItemHistory(), {});
assert.equal(GROCERY_COPY.usualsEvery(7), 'About every week');
assert.equal(GROCERY_COPY.usualsEvery(14), 'About every 2 weeks');
assert.equal(GROCERY_COPY.usualsEvery(9), 'About every 9 days');

// --- Wiring: ticks and receipts feed it, unticking takes it back, sign-out clears it.
const appContext = read('context/AppContext.tsx');
assert.match(appContext, /setUsualItemsOwner\(ownerId\);/);
assert.match(appContext, /notePurchasedToday\(\[current\]\);/);
assert.match(appContext, /notePurchasedToday\(toCheck\);/);
assert.match(appContext, /if \(willUncheck && current\) noteTickTakenBack\(current\.name\);/);
assert.match(read('app/(tabs)/pantry.tsx'), /notePurchasedToday\(reviewItems\.filter\(\(item\) => item\.enabled\), new Date\(\), 'receipt'\);/);
assert.match(read('app/(tabs)/grocery.tsx'), /<UsualItemsCard groceryNames=\{groceryNames\} onAdd=\{addManualGroceryItem\} \/>/);
assert.match(read('lib/account/clearUserScopedLocalStorage.ts'), /clearUsualItemsForOwner\(userId\);/);
const card = read('components/grocery/UsualItemsCard.tsx');
assert.match(card, /if \(suggestions\.length === 0\) return null;/, 'no empty card for a new account');
assert.doesNotMatch(`${GROCERY_COPY.usualsTitle} ${GROCERY_COPY.usualsBlurb}`, /\$|\bsav/i, 'no money or savings claims on the card');
// This module never talks to the server itself: sync goes through the hooks lib/learningSync sets.
assert.doesNotMatch(read('lib/usual/usualItems.ts'), /getSupabase|fetch\(/);

console.log('usual-items-check: ok');
