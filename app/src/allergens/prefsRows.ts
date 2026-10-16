import { cleanAllergens, type AllergenKey } from './types';

/** public.user_diet_prefs, the columns the app reads and writes. */
export type DietPrefsRow = { user_id?: string; diets?: unknown; allergens?: unknown };

export type AllergenPrefs = { allergens: AllergenKey[]; diets: string[] };

/** One shared object, so a hook returning it keeps a stable identity between renders. */
export const EMPTY_PREFS: AllergenPrefs = Object.freeze({ allergens: [], diets: [] }) as AllergenPrefs;

export function cleanDiets(values: readonly unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const v of values ?? []) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Row to prefs; a missing row or odd values read as empty. Unknown allergen strings are dropped. */
export function prefsFromRow(row: DietPrefsRow | null | undefined): AllergenPrefs {
  if (!row) return { allergens: [], diets: [] };
  return {
    allergens: cleanAllergens(Array.isArray(row.allergens) ? row.allergens : []),
    diets: cleanDiets(Array.isArray(row.diets) ? row.diets : []),
  };
}

/** The row to upsert. */
export function rowFromPrefs(userId: string, prefs: AllergenPrefs): { user_id: string; diets: string[]; allergens: AllergenKey[] } {
  return { user_id: userId, diets: cleanDiets(prefs.diets), allergens: cleanAllergens(prefs.allergens) };
}
