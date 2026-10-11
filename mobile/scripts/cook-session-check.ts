import assert from 'node:assert/strict';
import {
  addMinute,
  anyTimerRunning,
  createCookSession,
  currentStepIndex,
  formatClock,
  markCurrentStepDone,
  normalizeFinished,
  pauseTimer,
  startTimer,
  stepsSignature,
  timerProgress,
  timerRemainingSec,
  timerStatus,
  toggleIngredientChecked,
  toggleStepDone,
  toggleTimer,
  updateTimer,
} from '../lib/cook/cookSession';
import {
  COOK_SESSION_MAX_AGE_MS,
  clearCookSession,
  loadOrCreateCookSession,
  saveCookSession,
} from '../lib/cook/cookSessionStorage';

const STEPS = [
  'Rinse the rice.',
  'Simmer 15 minutes without lifting the lid.',
  'Season the chicken.',
  'Sear the chicken 6 minutes per side.',
];
const T0 = 1_000_000;

// Creation: timers come from steps with a time, none auto-start.
const session = createCookSession('recipe-a', STEPS, T0);
assert.equal(session.timers.length, 2);
assert.deepEqual(
  session.timers.map((t) => [t.id, t.stepIndex, t.totalSec, t.endsAt]),
  [
    ['step-1', 1, 900, null],
    ['step-3', 3, 360, null],
  ],
);
assert.equal(anyTimerRunning(session, T0), false);

// A recipe with no steps has no timers and nothing current.
const empty = createCookSession('recipe-empty', [], T0);
assert.equal(empty.timers.length, 0);
assert.equal(currentStepIndex(empty, 0), -1);

// Start, read, pause, resume.
const ready = session.timers[1];
assert.equal(timerStatus(ready, T0), 'ready');
const running = startTimer(ready, T0);
assert.equal(timerStatus(running, T0), 'running');
assert.equal(timerRemainingSec(running, T0), 360);
assert.equal(timerRemainingSec(running, T0 + 60_000), 300);
assert.equal(timerRemainingSec(running, T0 + 60_500), 300); // rounds up: never shows 0 early
assert.equal(startTimer(running, T0 + 5000), running); // starting a running timer changes nothing

const paused = pauseTimer(running, T0 + 100_000);
assert.equal(timerStatus(paused, T0 + 100_000), 'paused');
assert.equal(timerRemainingSec(paused, T0 + 100_000), 260);
assert.equal(timerRemainingSec(paused, T0 + 999_999), 260); // paused time does not move
const resumed = toggleTimer(paused, T0 + 200_000);
assert.equal(timerStatus(resumed, T0 + 200_000), 'running');
assert.equal(timerRemainingSec(resumed, T0 + 230_000), 230);
assert.equal(toggleTimer(resumed, T0 + 230_000).endsAt, null); // toggle pauses a running timer

// Still correct after a long gap (screen asleep): time is based on the end moment.
assert.equal(timerRemainingSec(running, T0 + 359_000), 1);
assert.equal(timerStatus(running, T0 + 360_000), 'finished');
assert.equal(timerStatus(running, T0 + 9_999_000), 'finished');
assert.equal(timerRemainingSec(running, T0 + 9_999_000), 0);

// Progress.
assert.equal(timerProgress(ready, T0), 0);
assert.equal(timerProgress(running, T0 + 180_000), 0.5);
assert.equal(timerProgress(running, T0 + 400_000), 1);

// +1 minute on each state.
const plusReady = addMinute(ready, T0);
assert.equal(plusReady.totalSec, 420);
assert.equal(timerRemainingSec(plusReady, T0), 420);
assert.equal(plusReady.endsAt, null);
const plusRunning = addMinute(running, T0 + 60_000);
assert.equal(timerStatus(plusRunning, T0 + 60_000), 'running');
assert.equal(timerRemainingSec(plusRunning, T0 + 60_000), 360);
const plusFinished = addMinute(running, T0 + 400_000);
assert.equal(timerStatus(plusFinished, T0 + 400_000), 'running');
assert.equal(timerRemainingSec(plusFinished, T0 + 400_000), 60);
const plusPaused = addMinute(paused, T0 + 150_000);
assert.equal(timerRemainingSec(plusPaused, T0 + 150_000), 320);
assert.equal(plusPaused.endsAt, null);

// A finished timer restarts from its full length.
const finishedStatic = { ...ready, remainingSec: 0, endsAt: null };
assert.equal(timerStatus(finishedStatic, T0), 'finished');
assert.equal(timerRemainingSec(startTimer(finishedStatic, T0), T0), 360);

// normalizeFinished stops timers that ran out, and leaves the object alone otherwise.
const withRunning = updateTimer(session, 'step-3', (t) => startTimer(t, T0));
assert.equal(anyTimerRunning(withRunning, T0 + 1000), true);
assert.equal(normalizeFinished(withRunning, T0 + 1000), withRunning);
const settled = normalizeFinished(withRunning, T0 + 400_000);
assert.notEqual(settled, withRunning);
assert.equal(anyTimerRunning(settled, T0 + 400_000), false);
assert.equal(timerStatus(settled.timers[1], T0 + 400_000), 'finished');
assert.equal(settled.timers[1].endsAt, null);
assert.equal(settled.timers[0], withRunning.timers[0]); // untouched timer is the same object

// Steps and ingredients.
let s = createCookSession('recipe-a', STEPS, T0);
assert.equal(currentStepIndex(s, STEPS.length), 0);
s = markCurrentStepDone(s, STEPS.length);
s = markCurrentStepDone(s, STEPS.length);
assert.deepEqual(s.doneSteps, [0, 1]);
assert.equal(currentStepIndex(s, STEPS.length), 2);
s = toggleStepDone(s, 0); // un-check an earlier step: it becomes current again
assert.equal(currentStepIndex(s, STEPS.length), 0);
s = toggleStepDone(s, 0);
s = markCurrentStepDone(s, STEPS.length);
s = markCurrentStepDone(s, STEPS.length);
assert.equal(currentStepIndex(s, STEPS.length), -1);
assert.equal(markCurrentStepDone(s, STEPS.length), s); // nothing left: no change

s = toggleIngredientChecked(s, 3);
s = toggleIngredientChecked(s, 1);
assert.deepEqual(s.checkedIngredients, [1, 3]);
s = toggleIngredientChecked(s, 3);
assert.deepEqual(s.checkedIngredients, [1]);

// Clock text.
assert.equal(formatClock(0), '00:00');
assert.equal(formatClock(65), '01:05');
assert.equal(formatClock(900), '15:00');
assert.equal(formatClock(3600), '1:00:00');
assert.equal(formatClock(5405), '1:30:05');
assert.equal(formatClock(-5), '00:00');

// Signature changes when the steps change.
assert.notEqual(stepsSignature(STEPS), stepsSignature([...STEPS, 'Serve.']));
assert.equal(stepsSignature(STEPS), stepsSignature([...STEPS]));

// Device storage: round trip, expiry, changed recipe, clear.
const key = 'recipe-storage';
clearCookSession(key);
const fresh = loadOrCreateCookSession(key, STEPS, T0);
assert.equal(fresh.doneSteps.length, 0);
const progressed = updateTimer(toggleStepDone(fresh, 0), 'step-1', (t) => startTimer(t, T0));
saveCookSession(progressed, T0);
const restored = loadOrCreateCookSession(key, STEPS, T0 + 60_000);
assert.deepEqual(restored.doneSteps, [0]);
assert.equal(timerStatus(restored.timers[0], T0 + 60_000), 'running');
assert.equal(timerRemainingSec(restored.timers[0], T0 + 60_000), 840);
const changedRecipe = loadOrCreateCookSession(key, [...STEPS, 'Serve.'], T0 + 60_000);
assert.equal(changedRecipe.doneSteps.length, 0);
const expired = loadOrCreateCookSession(key, STEPS, T0 + COOK_SESSION_MAX_AGE_MS + 1);
assert.equal(expired.doneSteps.length, 0);
clearCookSession(key);
assert.equal(loadOrCreateCookSession(key, STEPS, T0 + 1000).doneSteps.length, 0);

console.log('cook-session-check: ok');
