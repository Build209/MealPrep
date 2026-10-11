/**
 * Cook mode session: which steps are done, which ingredients are ready, and the timers.
 *
 * Timers store the moment they end (`endsAt`, epoch milliseconds) instead of counting
 * down every second, so they stay correct when the screen sleeps or the tab is in the
 * background. Every function takes `now` so it can be tested without a clock.
 * No function here touches the network or the server.
 */

import { detectStepTimers } from './stepTimers';

export interface CookTimer {
  id: string;
  stepIndex: number;
  /** Short chip text from the step, for example "15 min". */
  label: string;
  totalSec: number;
  /** Seconds left while not running (paused, ready or finished). */
  remainingSec: number;
  /** Epoch milliseconds when a running timer ends, or null when not running. */
  endsAt: number | null;
}

export interface CookSession {
  recipeKey: string;
  /** Changes when the recipe's steps change, so an old saved session is not reused. */
  signature: string;
  startedAt: number;
  doneSteps: number[];
  checkedIngredients: number[];
  timers: CookTimer[];
}

export type CookTimerStatus = 'ready' | 'running' | 'paused' | 'finished';

export function stepsSignature(steps: readonly string[]): string {
  let hash = 5381;
  const text = steps.join('\n');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${steps.length}:${(hash >>> 0).toString(36)}`;
}

export function createCookSession(
  recipeKey: string,
  steps: readonly string[],
  now: number,
): CookSession {
  return {
    recipeKey,
    signature: stepsSignature(steps),
    startedAt: now,
    doneSteps: [],
    checkedIngredients: [],
    timers: detectStepTimers(steps).map((s) => ({
      id: `step-${s.stepIndex}`,
      stepIndex: s.stepIndex,
      label: s.label,
      totalSec: s.seconds,
      remainingSec: s.seconds,
      endsAt: null,
    })),
  };
}

export function timerRemainingSec(timer: CookTimer, now: number): number {
  if (timer.endsAt === null) return Math.max(0, timer.remainingSec);
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function timerStatus(timer: CookTimer, now: number): CookTimerStatus {
  const remaining = timerRemainingSec(timer, now);
  if (remaining === 0) return 'finished';
  if (timer.endsAt !== null) return 'running';
  return remaining === timer.totalSec ? 'ready' : 'paused';
}

/** Fraction of the timer already used, from 0 to 1. */
export function timerProgress(timer: CookTimer, now: number): number {
  if (timer.totalSec <= 0) return 1;
  const used = timer.totalSec - timerRemainingSec(timer, now);
  return Math.min(1, Math.max(0, used / timer.totalSec));
}

export function startTimer(timer: CookTimer, now: number): CookTimer {
  const status = timerStatus(timer, now);
  if (status === 'running') return timer;
  const remaining = status === 'finished' ? timer.totalSec : timerRemainingSec(timer, now);
  return { ...timer, remainingSec: remaining, endsAt: now + remaining * 1000 };
}

export function pauseTimer(timer: CookTimer, now: number): CookTimer {
  if (timerStatus(timer, now) !== 'running') return timer;
  return { ...timer, remainingSec: timerRemainingSec(timer, now), endsAt: null };
}

export function toggleTimer(timer: CookTimer, now: number): CookTimer {
  return timerStatus(timer, now) === 'running' ? pauseTimer(timer, now) : startTimer(timer, now);
}

/** Adds one minute. On a finished timer this starts a fresh one-minute countdown. */
export function addMinute(timer: CookTimer, now: number): CookTimer {
  const status = timerStatus(timer, now);
  const remaining = timerRemainingSec(timer, now) + 60;
  const totalSec = Math.max(timer.totalSec, remaining);
  if (status === 'running' || status === 'finished') {
    return { ...timer, totalSec, remainingSec: remaining, endsAt: now + remaining * 1000 };
  }
  return { ...timer, totalSec, remainingSec: remaining, endsAt: null };
}

/** Marks timers whose time ran out as finished (stops them counting). Returns the same object if none changed. */
export function normalizeFinished(session: CookSession, now: number): CookSession {
  let changed = false;
  const timers = session.timers.map((t) => {
    if (t.endsAt !== null && timerRemainingSec(t, now) === 0) {
      changed = true;
      return { ...t, remainingSec: 0, endsAt: null };
    }
    return t;
  });
  return changed ? { ...session, timers } : session;
}

export function anyTimerRunning(session: CookSession, now: number): boolean {
  return session.timers.some((t) => timerStatus(t, now) === 'running');
}

export function updateTimer(
  session: CookSession,
  timerId: string,
  change: (timer: CookTimer) => CookTimer,
): CookSession {
  return {
    ...session,
    timers: session.timers.map((t) => (t.id === timerId ? change(t) : t)),
  };
}

function toggleIn(list: readonly number[], value: number): number[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value].sort((a, b) => a - b);
}

export function toggleStepDone(session: CookSession, stepIndex: number): CookSession {
  return { ...session, doneSteps: toggleIn(session.doneSteps, stepIndex) };
}

export function toggleIngredientChecked(session: CookSession, ingredientIndex: number): CookSession {
  return { ...session, checkedIngredients: toggleIn(session.checkedIngredients, ingredientIndex) };
}

/** First step not yet done, or -1 when every step is done (or there are no steps). */
export function currentStepIndex(session: CookSession, stepCount: number): number {
  for (let i = 0; i < stepCount; i += 1) {
    if (!session.doneSteps.includes(i)) return i;
  }
  return -1;
}

export function markCurrentStepDone(session: CookSession, stepCount: number): CookSession {
  const index = currentStepIndex(session, stepCount);
  return index === -1 ? session : toggleStepDone(session, index);
}

/** "05:00", or "1:05:00" when an hour or more. */
export function formatClock(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
