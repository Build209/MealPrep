/**
 * Grocery list grouping by store aisle, copied from the old app (mobile/lib/grocery.ts
 * GROCERY_AISLE_ORDER, groupGroceryByAisle and createManualGroceryItem;
 * mobile/lib/recipeMatch/groceryFromMissing.ts groceryDedupeKey). Pure: no network, no React.
 *
 * Day / meal grouping and the combined view (mobile/lib/grocery/grouping.ts) need the meal plan
 * and arrive with recipes (rebuild phase 3).
 */
import { CATEGORY_LABELS, normalizePantryCategory, type PantryCategory } from './categories';
import { inferGroceryCategoryFromName } from './categorize';
import { normalizeIngredientName } from './ingredientNormalize';

/** Store aisle order for the grouped grocery list. */
export const GROCERY_AISLE_ORDER: readonly PantryCategory[] = [
  'produce',
  'meats',
  'dairy',
  'frozen',
  'dry_goods',
  'condiments',
  'spices',
  'cookware',
];

export type AisleItem = { name: string; category: string };

export type GroceryAisle<T extends AisleItem> = {
  category: PantryCategory;
  label: string;
  items: T[];
};

/**
 * Items in aisle order (produce first), A to Z inside each aisle. A stored category the app
 * does not know is read as dry goods. Empty aisles are left out. Never changes the input.
 */
export function groupGroceryByAisle<T extends AisleItem>(items: readonly T[]): GroceryAisle<T>[] {
  const byCategory = new Map<PantryCategory, T[]>();
  for (const item of items) {
    const category = normalizePantryCategory(item.category);
    const list = byCategory.get(category) ?? [];
    list.push(item);
    byCategory.set(category, list);
  }
  const aisles: GroceryAisle<T>[] = [];
  for (const category of GROCERY_AISLE_ORDER) {
    const aisleItems = byCategory.get(category);
    if (!aisleItems?.length) continue;
    aisles.push({ category, label: CATEGORY_LABELS[category], items: sortByName(aisleItems) });
  }
  return aisles;
}

function sortByName<T extends AisleItem>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

/** Dedupe key for grocery rows: normalised ingredient name + unit (case and spaces ignored). */
export function groceryDedupeKey(name: string, unit: string): string {
  return `${normalizeIngredientName(name)}::${unit.trim().toLowerCase()}`;
}

/** The fields a hand-added grocery row is saved with (old app: createManualGroceryItem). */
export type ManualGroceryFields = {
  ingredientId: string;
  name: string;
  category: PantryCategory;
  quantity: number;
  unit: string;
  origin: 'manual';
};

/**
 * A hand-added row: trimmed name, aisle guessed from the name unless given, empty unit
 * becomes 'each', and an ingredient id of the old app's manual shape (manual-<slug>-<ms>).
 */
export function manualGroceryFields(
  input: { name: string; quantity: number; unit: string; category?: PantryCategory },
  nowMs = Date.now(),
): ManualGroceryFields {
  const name = input.name.trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  return {
    ingredientId: `manual-${slug}-${nowMs}`,
    name,
    category: input.category ?? inferGroceryCategoryFromName(name),
    quantity: input.quantity,
    unit: input.unit.trim() || 'each',
    origin: 'manual',
  };
}
