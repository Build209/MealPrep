/**
 * Forky backing off (learning step 3): a tip that keeps being closed rests, a tip that is used is
 * forgiven, and the person can turn tips down or off. Run: npm run test:forky-tip-backoff
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_FORKY_BACKOFF,
  FORKY_BACKOFF_RULES,
  FORKY_TIP_BACKOFF_STORAGE_KEY,
  FORKY_TIP_FREQUENCY_STORAGE_KEY,
  forkyRestDays,
  forkyTipAllowed,
  forkyTipOutcome,
  forkyTipShown,
  isForkyTipResting,
  mayShowForkyTip,
  readForkyBackoff,
  readForkyTipFrequency,
  recordForkyTipOutcome,
  recordForkyTipShown,
  writeForkyTipFrequency,
  type ForkyBackoffState,
} from '../lib/forkinator/tipBackoff.ts';
import { resetForkinatorTipsStorage } from '../lib/forkinator/resetForkinatorTips.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8');
const day = (iso: string) => new Date(`${iso}T12:00:00`);

// --- Closed twice without using it: the tip rests for a week.
let state: ForkyBackoffState = EMPTY_FORKY_BACKOFF;
state = forkyTipShown(state, 'scanner', day('2026-10-01'), 'normal');
state = forkyTipOutcome(state, 'scanner', 'dismissed', day('2026-10-01'), 'normal');
assert.equal(mayShowForkyTip(state, 'scanner', day('2026-10-04'), 'normal'), true, 'one close is not enough');
state = forkyTipShown(state, 'scanner', day('2026-10-04'), 'normal');
state = forkyTipOutcome(state, 'scanner', 'dismissed', day('2026-10-04'), 'normal');
assert.equal(state.tips.scanner?.restUntilDay, '2026-10-11');
assert.equal(isForkyTipResting(state, 'scanner', day('2026-10-10')), true);
assert.equal(mayShowForkyTip(state, 'scanner', day('2026-10-10'), 'normal'), false);
assert.equal(mayShowForkyTip(state, 'scanner', day('2026-10-11'), 'normal'), true, 'back after seven days');
// Other tips are not affected.
assert.equal(mayShowForkyTip(state, 'aisleSort', day('2026-10-05'), 'normal'), true);

// --- Closed twice again: two weeks, then four, and it stops growing there.
for (const [first, second, until] of [
  ['2026-10-11', '2026-10-12', '2026-10-26'],
  ['2026-10-26', '2026-10-27', '2026-11-24'],
  ['2026-11-24', '2026-11-25', '2026-12-23'],
] as const) {
  state = forkyTipOutcome(forkyTipShown(state, 'scanner', day(first), 'normal'), 'scanner', 'dismissed', day(first), 'normal');
  state = forkyTipOutcome(forkyTipShown(state, 'scanner', day(second), 'normal'), 'scanner', 'dismissed', day(second), 'normal');
  assert.equal(state.tips.scanner?.restUntilDay, until);
}
assert.equal(state.tips.scanner?.level, FORKY_BACKOFF_RULES.maxLevel);

// --- Using the tip forgives everything.
state = forkyTipOutcome(forkyTipShown(state, 'scanner', day('2026-12-23'), 'normal'), 'scanner', 'tapped', day('2026-12-23'), 'normal');
assert.deepEqual(state.tips.scanner, { score: 0, level: 0, restUntilDay: null, awaitingOutcome: false });

// --- Left to fold away untouched counts half: four times in a row rests it; three does not.
let ignored: ForkyBackoffState = EMPTY_FORKY_BACKOFF;
for (const iso of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) {
  ignored = forkyTipShown(ignored, 'aisleSort', day(iso), 'normal');
}
assert.equal(ignored.tips.aisleSort?.score, 3, 'the fourth showing is still waiting for an answer');
assert.equal(isForkyTipResting(ignored, 'aisleSort', day('2026-10-05')), false);
ignored = forkyTipShown(ignored, 'aisleSort', day('2026-10-05'), 'normal');
assert.equal(ignored.tips.aisleSort?.restUntilDay, '2026-10-12');
// One close plus two ignores also reaches the limit.
let mixed: ForkyBackoffState = EMPTY_FORKY_BACKOFF;
mixed = forkyTipOutcome(forkyTipShown(mixed, 'aisleSort', day('2026-10-01'), 'normal'), 'aisleSort', 'dismissed', day('2026-10-01'), 'normal');
mixed = forkyTipShown(mixed, 'aisleSort', day('2026-10-02'), 'normal');
mixed = forkyTipShown(mixed, 'aisleSort', day('2026-10-03'), 'normal');
assert.equal(isForkyTipResting(mixed, 'aisleSort', day('2026-10-04')), false);
mixed = forkyTipShown(mixed, 'aisleSort', day('2026-10-04'), 'normal');
assert.equal(isForkyTipResting(mixed, 'aisleSort', day('2026-10-05')), true);

// --- Food about to expire rests for less time: missing it costs food.
assert.deepEqual([1, 2, 3].map((level) => forkyRestDays('expiration', level, 'normal')), [3, 7, 14]);
assert.deepEqual([1, 2, 3].map((level) => forkyRestDays('scanner', level, 'normal')), [7, 14, 28]);
assert.deepEqual([1, 2, 3].map((level) => forkyRestDays('scanner', level, 'less')), [14, 28, 56]);

// --- "Less often": at least three days between tips, except food about to expire. "Off": none.
let less: ForkyBackoffState = forkyTipShown(EMPTY_FORKY_BACKOFF, 'aisleSort', day('2026-10-01'), 'less');
less = forkyTipOutcome(less, 'aisleSort', 'tapped', day('2026-10-01'), 'less');
assert.equal(mayShowForkyTip(less, 'scanner', day('2026-10-03'), 'less'), false);
assert.equal(mayShowForkyTip(less, 'scanner', day('2026-10-04'), 'less'), true);
assert.equal(mayShowForkyTip(less, 'expiration', day('2026-10-02'), 'less'), true);
assert.equal(mayShowForkyTip(less, 'scanner', day('2026-10-02'), 'normal'), true);
for (const tip of ['expiration', 'aisleSort', 'scanner'] as const) {
  assert.equal(mayShowForkyTip(EMPTY_FORKY_BACKOFF, tip, day('2026-10-02'), 'off'), false);
}

// --- On the device: the greeting and the restock notice are never held back; "Reset Forky tips"
// clears the scores and keeps the frequency choice.
assert.equal(readForkyTipFrequency(), 'normal');
recordForkyTipShown('scanner', day('2026-10-01'));
recordForkyTipOutcome('scanner', 'dismissed', day('2026-10-01'));
recordForkyTipShown('scanner', day('2026-10-02'));
recordForkyTipOutcome('scanner', 'dismissed', day('2026-10-02'));
assert.equal(forkyTipAllowed('scanner', day('2026-10-03')), false);
assert.equal(forkyTipAllowed('greeting', day('2026-10-03')), true);
assert.equal(forkyTipAllowed('restock', day('2026-10-03')), true);
recordForkyTipShown('restock', day('2026-10-03'));
recordForkyTipOutcome('greeting', 'dismissed', day('2026-10-03'));
assert.deepEqual(Object.keys(readForkyBackoff().tips), ['scanner'], 'only real tips are scored');
writeForkyTipFrequency('off');
assert.equal(forkyTipAllowed('expiration', day('2026-12-01')), false);
assert.equal(forkyTipAllowed('restock', day('2026-12-01')), true, 'the restock notice reports an action and always shows');
assert.ok(FORKY_TIP_BACKOFF_STORAGE_KEY.startsWith('mealprep.forkinator.'));
assert.ok(!FORKY_TIP_FREQUENCY_STORAGE_KEY.startsWith('mealprep.forkinator.'));
resetForkinatorTipsStorage();
assert.deepEqual(readForkyBackoff(), EMPTY_FORKY_BACKOFF, 'Reset Forky tips clears the scores');
assert.equal(readForkyTipFrequency(), 'off', 'the frequency choice is a setting and stays');
writeForkyTipFrequency('normal');
assert.equal(forkyTipAllowed('scanner', day('2026-10-03')), true);

// --- Wiring: each tip asks before it opens, and every tap or close is recorded.
const overlay = read('components/forkinator/ForkinatorOverlay.tsx');
assert.match(overlay, /expirationPlan\.show && forkyTipAllowed\('expiration'\)/);
assert.match(overlay, /if \(!forkyTipAllowed\('scanner'\)\) return;/);
assert.match(overlay, /if \(!forkyTipAllowed\('aisleSort'\)\) return;/);
assert.match(overlay, /recordForkyTipShown\(kind\);/);
for (const tip of ['expiration', 'aisleSort', 'scanner']) {
  assert.match(overlay, new RegExp(`recordForkyTipOutcome\\('${tip}', 'tapped'\\)`), `${tip}: use is recorded`);
  assert.match(overlay, new RegExp(`recordForkyTipOutcome\\('${tip}', 'dismissed'\\)`), `${tip}: close is recorded`);
}
assert.doesNotMatch(overlay, /forkyTipAllowed\('(restock|greeting)'\)/, 'the restock notice and greeting are not gated');
assert.match(overlay, /tipFrequency !== 'off' &&/, '"Can\'t decide?" bubbles are hidden when tips are off');
const account = read('components/account/AccountSheet.tsx');
assert.match(account, /FORKY_TIP_FREQUENCIES\.map/);
assert.match(account, /writeForkyTipFrequency\(next\);/);
assert.match(account, /emitForkinatorTipsReset\(\);/);
assert.match(account, /min-h-\[44px\]/, 'tap targets are at least 44px');

console.log('forky-tip-backoff-check: ok');
