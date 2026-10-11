import { useCallback, useEffect, useState } from 'react';
import {
  addMinute,
  markCurrentStepDone,
  normalizeFinished,
  toggleIngredientChecked,
  toggleStepDone,
  toggleTimer,
  updateTimer,
  type CookSession,
} from '../lib/cook/cookSession';
import { loadOrCreateCookSession, saveCookSession } from '../lib/cook/cookSessionStorage';

/**
 * Holds the cook session for one recipe: saves it on this device after every change and
 * refreshes the clock twice a second while any timer is running.
 */
export function useCookSession(recipeKey: string, steps: readonly string[]) {
  const [session, setSession] = useState<CookSession>(() =>
    loadOrCreateCookSession(recipeKey, steps, Date.now()),
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    saveCookSession(session, Date.now());
  }, [session]);

  const hasRunning = session.timers.some((t) => t.endsAt !== null);
  useEffect(() => {
    if (!hasRunning) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      // Timers that ran out stop counting; once none are left running this interval stops.
      setSession((prev) => normalizeFinished(prev, t));
    }, 500);
    return () => clearInterval(id);
  }, [hasRunning]);

  const change = useCallback((apply: (prev: CookSession, at: number) => CookSession) => {
    const at = Date.now();
    setNow(at);
    setSession((prev) => apply(prev, at));
  }, []);

  return {
    session,
    now,
    markCurrentStepDone: useCallback(
      () => change((prev) => markCurrentStepDone(prev, steps.length)),
      [change, steps.length],
    ),
    toggleStep: useCallback((index: number) => change((prev) => toggleStepDone(prev, index)), [change]),
    toggleIngredient: useCallback(
      (index: number) => change((prev) => toggleIngredientChecked(prev, index)),
      [change],
    ),
    toggleTimerById: useCallback(
      (timerId: string) => change((prev, at) => updateTimer(prev, timerId, (t) => toggleTimer(t, at))),
      [change],
    ),
    addMinuteById: useCallback(
      (timerId: string) => change((prev, at) => updateTimer(prev, timerId, (t) => addMinute(t, at))),
      [change],
    ),
  };
}
