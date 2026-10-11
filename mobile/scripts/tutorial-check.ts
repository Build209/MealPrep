/**
 * First-time tour (owner's brief, 2026-10-10): greyed page, Forky introduces himself with his
 * full name, one lit-up button per step, easy to skip, and a mention that you can ask Forky.
 *
 * Run from mobile/: npm run test:tutorial
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TUTORIAL, TUTORIAL_COPY, TUTORIAL_STEPS, type TutorialTargetId } from '../config/tutorial';
import {
  autoStartTutorialOnce,
  canOpenTutorialFromAccount,
  endTutorial,
  getTutorialState,
  measureTutorialTarget,
  nextTutorialStep,
  previousTutorialStep,
  readTutorialDone,
  registerTutorialTarget,
  resetTutorialForTests,
  shouldAutoStartTutorial,
  spotlightForRect,
  startTutorial,
  subscribeTutorial,
  TUTORIAL_DONE_STORAGE_KEY,
  tutorialCardPlacement,
} from '../lib/tutorial/tutorialStore';
import { writeJson } from '../lib/storage';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// --- The script the owner approved ---
assert.equal(TUTORIAL_STEPS.length, 9);
assert.match(TUTORIAL_STEPS[0].title, /Forky McForkface/, 'Forky introduces himself with his full name');
assert.equal(TUTORIAL_STEPS[0].target, 'forky');
assert.deepEqual(
  TUTORIAL_STEPS.map((step) => step.route),
  ['/', '/pantry', '/pantry', '/pantry', '/', '/', '/grocery', '/stores', '/'],
  'Pantry first (photo, list, receipt), then recipes, plan, grocery, stores',
);
assert.equal(TUTORIAL_STEPS[1].target, 'pantry-scan', 'the camera card is the first thing lit up');
assert.equal(TUTORIAL_STEPS[2].sample, 'scan-review', 'the list step shows an example, nothing real is added');
assert.match(TUTORIAL_STEPS[3].message, /same monthly scans/, 'the receipt step says receipts use the same monthly scans');
assert.doesNotMatch(TUTORIAL_STEPS[3].message, /Plus/, 'receipts are no longer paid-only');
const last = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1];
assert.equal(last.target, 'forky');
assert.match(TUTORIAL_COPY.askForkyOn, /ask me/i, 'tells people they can ask Forky directly');
assert.doesNotMatch(TUTORIAL_COPY.askForkyOff, /ask me/i, 'does not promise the chat where it is switched off');
for (const step of TUTORIAL_STEPS) {
  assert.ok(step.title.length > 0 && step.title.length <= 40, step.id);
  assert.ok(step.id === 'ask' || (step.message.length > 20 && step.message.length <= 140), `${step.id}: short enough to read at a glance`);
  // Compliance rule 4: no dollar or percentage savings claims.
  assert.doesNotMatch(`${step.title} ${step.message}`, /\$\d|\d+ ?%|save money|cheapest/i, step.id);
}
assert.equal(TUTORIAL.liveForEveryone, true, 'live for everyone (owner, 2026-10-10)');

// --- Start, step, skip ---
resetTutorialForTests();
writeJson(TUTORIAL_DONE_STORAGE_KEY, false);
let notified = 0;
const unsubscribe = subscribeTutorial(() => (notified += 1));
assert.deepEqual(getTutorialState(), { active: false, stepIndex: 0 });
previousTutorialStep();
nextTutorialStep();
assert.equal(getTutorialState().active, false, 'buttons do nothing while the tour is closed');
startTutorial();
assert.deepEqual(getTutorialState(), { active: true, stepIndex: 0 });
previousTutorialStep();
assert.equal(getTutorialState().stepIndex, 0, 'Back stops at the first step');
nextTutorialStep();
nextTutorialStep();
assert.equal(getTutorialState().stepIndex, 2);
previousTutorialStep();
assert.equal(getTutorialState().stepIndex, 1);
assert.equal(readTutorialDone(), false);
endTutorial();
assert.deepEqual(getTutorialState(), { active: false, stepIndex: 0 }, 'Skip closes it from any step');
assert.equal(readTutorialDone(), true, 'a skipped tour does not come back by itself');
assert.ok(notified >= 5);
// Next on the last step finishes.
startTutorial();
for (let i = 0; i < TUTORIAL_STEPS.length; i += 1) nextTutorialStep();
assert.equal(getTutorialState().active, false);
unsubscribe();

// --- Moving between tabs never restarts the tour (bug found live, 2026-10-10) ---
resetTutorialForTests();
writeJson(TUTORIAL_DONE_STORAGE_KEY, false);
assert.equal(autoStartTutorialOnce(), TUTORIAL.liveForEveryone, 'a new visitor gets the tour when it is live');
if (TUTORIAL.liveForEveryone) {
  nextTutorialStep();
  nextTutorialStep();
  assert.equal(getTutorialState().stepIndex, 2);
  assert.equal(autoStartTutorialOnce(), false, 'asked again after a screen change: nothing happens');
  startTutorial();
  assert.equal(getTutorialState().stepIndex, 2, 'starting an open tour does not send it back to step 1');
  endTutorial();
  assert.equal(autoStartTutorialOnce(), false, 'and it does not come back after Skip');
}
resetTutorialForTests();
writeJson(TUTORIAL_DONE_STORAGE_KEY, true);
assert.equal(autoStartTutorialOnce(), false, 'a visitor who already saw it is left alone');
assert.equal(getTutorialState().active, false);

// --- Who sees it ---
assert.equal(shouldAutoStartTutorial({ liveForEveryone: false, done: false }), false);
assert.equal(shouldAutoStartTutorial({ liveForEveryone: true, done: false }), true);
assert.equal(shouldAutoStartTutorial({ liveForEveryone: true, done: true }), false, 'once only');
assert.equal(canOpenTutorialFromAccount({ isAdmin: true, liveForEveryone: false }), true);
assert.equal(canOpenTutorialFromAccount({ isAdmin: false, liveForEveryone: false }), false);
assert.equal(canOpenTutorialFromAccount({ isAdmin: false, liveForEveryone: true }), true);

// --- Lighting up an element ---
const screen = { width: 390, height: 844, bottomBarHeight: TUTORIAL.tabBarHeightPx };
const lit = spotlightForRect({ x: 20, y: 200, width: 350, height: 76 }, screen, 6);
assert.deepEqual(lit, { x: 14, y: 194, width: 362, height: 88 });
assert.equal(spotlightForRect(null, screen), null);
assert.equal(spotlightForRect({ x: 0, y: 0, width: 0, height: 0 }, screen), null, 'a hidden tab measures as nothing');
assert.equal(spotlightForRect({ x: 20, y: 900, width: 300, height: 60 }, screen), null, 'scrolled off the bottom');
assert.equal(spotlightForRect({ x: 20, y: 760, width: 300, height: 60 }, screen), null, 'under the tab bar');
assert.equal(spotlightForRect({ x: 20, y: -40, width: 300, height: 60 }, screen), null, 'scrolled off the top');
assert.equal(spotlightForRect({ x: Number.NaN, y: 10, width: 10, height: 10 }, screen), null);
const edge = spotlightForRect({ x: 2, y: 3, width: 386, height: 40 }, screen, 6);
assert.ok(edge && edge.x === 0 && edge.y === 0 && edge.x + edge.width === 390, 'the outline stays on screen');
// The card goes under something near the top and above something near the bottom.
assert.deepEqual(tutorialCardPlacement(lit, screen), { anchor: 'top', top: 194 + 88 + 14 });
const low = spotlightForRect({ x: 20, y: 600, width: 350, height: 60 }, screen, 6);
assert.deepEqual(tutorialCardPlacement(low, screen), { anchor: 'bottom', bottom: 844 - 594 + 14 });
assert.deepEqual(tutorialCardPlacement(null, screen), { anchor: 'middle' }, 'nothing lit up: card in the middle');

// --- Screens register what can be lit up ---
resetTutorialForTests();
let answer: unknown = 'unset';
measureTutorialTarget('pantry-scan', (rect) => (answer = rect));
assert.equal(answer, null, 'a screen that is not mounted gives nothing, the step still shows');
const off = registerTutorialTarget('pantry-scan', (done) => done({ x: 1, y: 2, width: 3, height: 4 }));
measureTutorialTarget('pantry-scan', (rect) => (answer = rect));
assert.deepEqual(answer, { x: 1, y: 2, width: 3, height: 4 });
registerTutorialTarget('grocery-add', () => {
  throw new Error('measure failed');
});
measureTutorialTarget('grocery-add', (rect) => (answer = rect));
assert.equal(answer, null, 'a failing measurement never breaks the tour');
off();
measureTutorialTarget('pantry-scan', (rect) => (answer = rect));
assert.equal(answer, null);

// Every element a step points at is registered by some screen (Forky's place is worked out).
const wired: Record<Exclude<TutorialTargetId, 'forky'>, string> = {
  'pantry-scan': 'components/PantryStorageScanButtons.web.tsx',
  'pantry-receipt': 'components/PantryStorageScanButtons.tsx',
  'home-search': 'app/(tabs)/index.tsx',
  'home-week-plan': 'components/AppHeader.tsx',
  'grocery-add': 'app/(tabs)/grocery.tsx',
  'stores-search': 'app/(tabs)/stores.tsx',
};
for (const step of TUTORIAL_STEPS) {
  if (step.target == null || step.target === 'forky') continue;
  const source = read(wired[step.target]);
  assert.match(source, /useTutorialTarget\(/, `${step.target} is registered in ${wired[step.target]}`);
  assert.ok(source.includes(`'${step.target}'`), `${step.target} id used in ${wired[step.target]}`);
  assert.match(source, /ref=\{tutorial\w*Ref\}/, `${step.target} ref is attached`);
}
for (const file of ['components/PantryStorageScanButtons.web.tsx', 'components/PantryStorageScanButtons.tsx']) {
  assert.match(read(file), /variant === 'receipt' \? 'pantry-receipt' : 'pantry-scan'/);
}

// --- Overlay wiring ---
const overlay = read('components/tutorial/TutorialOverlay.tsx');
assert.match(overlay, /onPress=\{endTutorial\}/, 'Skip is wired');
assert.match(overlay, /TUTORIAL_COPY\.skip/);
assert.equal((overlay.match(/min-h-\[44px\]/g) ?? []).length >= 3, true, 'Skip, Back and Next are at least 44px tall');
assert.match(overlay, /router\.navigate\(step\.route\)/, 'each step opens its own tab');
assert.match(overlay, /markForkinatorGreetingShown\(\)/, 'the tour replaces the one-line greeting');
assert.match(overlay, /askForkyAvailable \? TUTORIAL_COPY\.askForkyOn : TUTORIAL_COPY\.askForkyOff/);
assert.match(read('components/AppOverlays.tsx'), /<TutorialOverlay \/>/);
const account = read('components/account/AccountSheet.tsx');
assert.match(account, /canOpenTutorialFromAccount\(\{ isAdmin \}\)/, 'account menu entry, admins only for now');
assert.match(account, /function openTutorial\(\) \{\s+onClose\(\);/, 'the account sheet closes before the tour starts');
assert.match(read('components/forkinator/ForkinatorOverlay.tsx'), /!tutorialActive/, "Forky's own clouds stay out of the tour's way");

console.log('tutorial-check: ok');
