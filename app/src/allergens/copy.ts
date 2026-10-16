import { ALLERGEN_LABELS, type AllergenKey } from './types';

/**
 * Wording for allergen flags. Rule: never say "safe", "allergen-free" or "guaranteed". These are
 * matches on ingredient names only, so every flag sits near the "check labels" line.
 */
export const ALLERGEN_COPY = {
  flaggedTitle: 'Contains your allergens',
  flaggedIntro:
    'These have an ingredient that matches an allergen in your profile. Ingredient matches are an estimate: check labels and verify before you cook.',
  flaggedHidden: (n: number) =>
    n === 1 ? '1 more with your allergens. Search to find it.' : `${n} more with your allergens. Search to find them.`,
} as const;

/** "Contains: peanuts, milk" (labels in lower case, in the order given). '' when none. */
export function containsLine(allergens: readonly AllergenKey[]): string {
  if (allergens.length === 0) return '';
  return `Contains: ${allergens.map((a) => ALLERGEN_LABELS[a].toLowerCase()).join(', ')}`;
}
