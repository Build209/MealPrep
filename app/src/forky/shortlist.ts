/**
 * The recipe shortlist sent with each question, and the recipe buttons shown under Forky's answers.
 *
 * The old app sent its best pantry matches (pantryRecipeMatchesRankedFiltered, top 8) and the
 * function only ever answers with ids from that list. Here the ids are the new app's route ids
 * (r_<uuid> for public.recipes, l_<uuid> for published public.library_recipes), so a button can
 * link straight to /recipe/<id>. A button is shown only when the id is one the app can open and
 * the recipe is on the shortlist (old app: no title, no button).
 *
 * Pure functions only (tests/forky-shortlist.test.ts).
 */
import { recipeAllergenStatus } from '../allergens/detect';
import type { AllergenKey } from '../allergens/types';
import { bestPantryMatch, type PantryMatchRow } from '../kitchen/pantryMatch';
import { ASK_FORKY_LIMITS } from './copy';
import type { ForkyRecipeInput } from './request';

export type ShortlistRecipe = { id: string; title: string; ingredients: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for r_<uuid> and l_<uuid>, the ids /recipe/[id] opens. (Same scheme as recipeRouteId in the
 * recipes work; switch to its parseRecipeRouteId once that is merged.)
 */
export function isOpenableRecipeId(id: string): boolean {
  if (!id.startsWith('r_') && !id.startsWith('l_')) return false;
  return UUID.test(id.slice(2));
}

export function recipeHref(id: string): `/recipe/${string}` {
  return `/recipe/${id}`;
}

/** Ingredient names out of a recipe's jsonb ingredients ([{ name, ... }] or plain strings). */
export function ingredientNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const entry of raw) {
    const name = typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? (entry as { name?: unknown }).name : null;
    if (typeof name === 'string' && name.trim()) names.push(name.trim());
  }
  return names;
}

/**
 * Best pantry matches first: the share of ingredients on hand, then how many, then the title.
 * Recipes with no ingredients are left out. At most 8 (the function's cap). Recipes whose ingredient
 * names match one of `userAllergens` are left out BEFORE the cap, so they never reach Forky and
 * cannot use up a slot. (Name-based estimate, not a safety check; the function is told too.)
 */
export function rankShortlist(
  recipes: readonly ShortlistRecipe[],
  pantry: readonly PantryMatchRow[],
  max: number = ASK_FORKY_LIMITS.recipes,
  userAllergens: readonly AllergenKey[] = [],
): ForkyRecipeInput[] {
  const memo = new Map<string, boolean>();
  const have = (name: string) => {
    const key = name.toLowerCase();
    let hit = memo.get(key);
    if (hit === undefined) {
      hit = pantry.length > 0 && bestPantryMatch(name, pantry) !== null;
      memo.set(key, hit);
    }
    return hit;
  };
  const scored: (ForkyRecipeInput & { share: number })[] = [];
  const seen = new Set<string>();
  for (const recipe of recipes) {
    if (!recipe.id || !recipe.title.trim() || seen.has(recipe.id) || recipe.ingredients.length === 0) continue;
    if (userAllergens.length > 0 && recipeAllergenStatus({ ingredients: recipe.ingredients.map((name) => ({ name })) }, userAllergens).length > 0) continue;
    seen.add(recipe.id);
    const missing: string[] = [];
    let matched = 0;
    for (const name of recipe.ingredients) {
      if (have(name)) matched += 1;
      else missing.push(name);
    }
    const total = recipe.ingredients.length;
    scored.push({ id: recipe.id, title: recipe.title.trim(), have: matched, total, missing: missing.slice(0, 6), share: matched / total });
  }
  scored.sort((a, b) => b.share - a.share || b.have - a.have || a.title.localeCompare(b.title));
  return scored.slice(0, max).map(({ share: _share, ...rest }) => rest);
}

export type RecipeButton = { id: string; title: string; href: `/recipe/${string}` };

/** Buttons for the ids in an answer: openable, on the shortlist, no repeats, at most 3. */
export function recipeButtons(recipeIds: readonly string[], shortlist: readonly { id: string; title: string }[]): RecipeButton[] {
  const titles = new Map(shortlist.map((r) => [r.id, r.title]));
  const out: RecipeButton[] = [];
  for (const id of recipeIds) {
    const title = titles.get(id);
    if (!title || !isOpenableRecipeId(id) || out.some((b) => b.id === id)) continue;
    out.push({ id, title, href: recipeHref(id) });
    if (out.length >= 3) break;
  }
  return out;
}
