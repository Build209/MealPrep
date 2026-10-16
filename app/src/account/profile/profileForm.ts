/**
 * Profile form rules, pure (tests/profile-form.test.ts). The screen keeps what the person typed
 * as a draft and compares it to what is saved; nothing here touches React or the network.
 */

export const NAME_MAX = 60;
export const NOTES_MAX = 200;
export const HOUSEHOLD_MIN = 1;
export const HOUSEHOLD_MAX = 12;

/** Diets offered as chips. Stored as these lowercase keys in user_diet_prefs.diets. */
export const DIET_OPTIONS: readonly { key: string; label: string }[] = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'pescatarian', label: 'Pescatarian' },
  { key: 'gluten-free', label: 'Gluten-free' },
  { key: 'dairy-free', label: 'Dairy-free' },
  { key: 'low-carb', label: 'Low-carb' },
];

export type ProfileDraft = {
  name: string;
  householdSize: number;
  dietaryNotes: string;
  diets: string[];
  allergens: string[];
};

export type ProfileErrors = { name?: 'empty' | 'too-long'; householdSize?: 'range'; dietaryNotes?: 'too-long' };

export function clampHousehold(n: number): number {
  if (!Number.isFinite(n)) return HOUSEHOLD_MIN;
  return Math.min(HOUSEHOLD_MAX, Math.max(HOUSEHOLD_MIN, Math.round(n)));
}

export function validateProfile(draft: Pick<ProfileDraft, 'name' | 'householdSize' | 'dietaryNotes'>): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'empty';
  else if (name.length > NAME_MAX) errors.name = 'too-long';
  if (!Number.isInteger(draft.householdSize) || draft.householdSize < HOUSEHOLD_MIN || draft.householdSize > HOUSEHOLD_MAX) {
    errors.householdSize = 'range';
  }
  if (draft.dietaryNotes.trim().length > NOTES_MAX) errors.dietaryNotes = 'too-long';
  return errors;
}

export function hasErrors(errors: ProfileErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Adds the key if missing, removes it if present; keeps the order of `all` so the saved list is stable. */
export function toggleKey<T extends string>(selected: readonly T[], key: T, all: readonly T[]): T[] {
  const next = new Set<T>(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return all.filter((k) => next.has(k));
}

/** The cleaned values that get sent: trimmed text, whole-number household size. */
export function cleanDraft(draft: ProfileDraft): ProfileDraft {
  return {
    name: draft.name.trim(),
    householdSize: clampHousehold(draft.householdSize),
    dietaryNotes: draft.dietaryNotes.trim(),
    diets: [...draft.diets],
    allergens: [...draft.allergens],
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/** Has the person changed anything since the last save? Drives the Save button. */
export function isDirty(draft: ProfileDraft, saved: ProfileDraft): boolean {
  const a = cleanDraft(draft);
  const b = cleanDraft(saved);
  return (
    a.name !== b.name ||
    a.householdSize !== b.householdSize ||
    a.dietaryNotes !== b.dietaryNotes ||
    !sameSet(a.diets, b.diets) ||
    !sameSet(a.allergens, b.allergens)
  );
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

/** What the line under Save should be, from the state alone (the words live in copy.ts). */
export function saveLineKind(status: SaveStatus, online: boolean, dirty: boolean): SaveStatus {
  if (status === 'saving') return 'saving';
  if (!online && dirty) return 'offline';
  if (status === 'saved' && !dirty) return 'saved';
  if (status === 'error') return 'error';
  return 'idle';
}
