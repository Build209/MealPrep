/**
 * Saves the cook session on this device only (browser storage on web, memory elsewhere),
 * so a reload or a closed tab does not lose running timers. Nothing is sent to the server.
 */

import { readJson, removeStorageKey, writeJson } from '../storage';
import { createCookSession, stepsSignature, type CookSession } from './cookSession';

const KEY_PREFIX = 'mealplanatic.cookSession.v1:';

/** A saved session older than this is dropped (nobody is still cooking from yesterday). */
export const COOK_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface StoredCookSession {
  savedAt: number;
  session: CookSession;
}

function isUsable(stored: StoredCookSession | null, signature: string, now: number): stored is StoredCookSession {
  if (!stored || typeof stored.savedAt !== 'number' || !stored.session) return false;
  if (now - stored.savedAt > COOK_SESSION_MAX_AGE_MS || now < stored.savedAt) return false;
  const s = stored.session;
  return (
    s.signature === signature &&
    Array.isArray(s.doneSteps) &&
    Array.isArray(s.checkedIngredients) &&
    Array.isArray(s.timers)
  );
}

export function loadOrCreateCookSession(
  recipeKey: string,
  steps: readonly string[],
  now: number,
): CookSession {
  const stored = readJson<StoredCookSession | null>(`${KEY_PREFIX}${recipeKey}`, null);
  if (isUsable(stored, stepsSignature(steps), now)) return stored.session;
  return createCookSession(recipeKey, steps, now);
}

export function saveCookSession(session: CookSession, now: number): void {
  writeJson(`${KEY_PREFIX}${session.recipeKey}`, { savedAt: now, session });
}

export function clearCookSession(recipeKey: string): void {
  removeStorageKey(`${KEY_PREFIX}${recipeKey}`);
}
