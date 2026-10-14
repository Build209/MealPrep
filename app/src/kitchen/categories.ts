/**
 * Pantry and grocery categories, copied from the old app (mobile/types/mealprep.ts
 * PANTRY_CATEGORIES and mobile/config/appConfig.ts CATEGORY_LABELS). The database column
 * `category` is free text, so rows are read through normalizePantryCategory.
 */

export const PANTRY_CATEGORIES = [
  'spices',
  'meats',
  'produce',
  'dairy',
  'dry_goods',
  'cookware',
  'frozen',
  'condiments',
] as const;
export type PantryCategory = (typeof PANTRY_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<PantryCategory, string> = {
  spices: 'Spices',
  meats: 'Meats',
  produce: 'Produce',
  dairy: 'Dairy',
  dry_goods: 'Dry goods',
  cookware: 'Cookware',
  frozen: 'Frozen',
  condiments: 'Condiments',
};

export function isPantryCategory(value: unknown): value is PantryCategory {
  return typeof value === 'string' && (PANTRY_CATEGORIES as readonly string[]).includes(value);
}

/** A stored category, or dry goods when the row holds something the app does not know. */
export function normalizePantryCategory(raw: string | null | undefined): PantryCategory {
  const value = (raw ?? '').trim().toLowerCase();
  return isPantryCategory(value) ? value : 'dry_goods';
}
