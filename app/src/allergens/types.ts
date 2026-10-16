/**
 * The nine major allergens the app tracks (US "big 9"). Stored as these exact strings in
 * public.user_diet_prefs.allergens. Unknown strings in that column are ignored when reading.
 */
export const ALLERGEN_KEYS = ['milk', 'eggs', 'fish', 'shellfish', 'tree-nuts', 'peanuts', 'wheat', 'soy', 'sesame'] as const;

export type AllergenKey = (typeof ALLERGEN_KEYS)[number];

export const ALLERGEN_LABELS: Record<AllergenKey, string> = {
  milk: 'Milk',
  eggs: 'Eggs',
  fish: 'Fish',
  shellfish: 'Shellfish',
  'tree-nuts': 'Tree nuts',
  peanuts: 'Peanuts',
  wheat: 'Wheat',
  soy: 'Soy',
  sesame: 'Sesame',
};

export function isAllergenKey(value: unknown): value is AllergenKey {
  return typeof value === 'string' && (ALLERGEN_KEYS as readonly string[]).includes(value);
}

/** Known allergens only, in the fixed ALLERGEN_KEYS order, no repeats. */
export function cleanAllergens(values: readonly unknown[] | null | undefined): AllergenKey[] {
  const set = new Set<AllergenKey>();
  for (const v of values ?? []) if (isAllergenKey(v)) set.add(v);
  return ALLERGEN_KEYS.filter((k) => set.has(k));
}
