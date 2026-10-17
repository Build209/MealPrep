import { imageAddress } from '../creators/videoText';

/**
 * The recipe rows search reads (recipes and library_recipes in
 * db/supabase/migrations/20261013000000_live_baseline.sql) and their mapping to one shape.
 * No network here, so tests can run it.
 *
 * Detail route ids (helper F's /recipe/[id]): `r_<uuid>` for a recipes row, `l_<uuid>` for a
 * library_recipes row.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID.test(value);
}

/** The value as a lower-case uuid, or null. */
export function asUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

export type RecipeTable = 'recipes' | 'library_recipes';

export function recipeRouteId(table: RecipeTable, uuid: string): string {
  return `${table === 'recipes' ? 'r' : 'l'}_${uuid}`;
}

/** `r_<uuid>` / `l_<uuid>` back to its table and uuid, or null. */
export function parseRecipeRouteId(routeId: string): { table: RecipeTable; uuid: string } | null {
  const match = /^([rl])_(.+)$/.exec(routeId);
  if (!match || !isUuid(match[2])) return null;
  return { table: match[1] === 'r' ? 'recipes' : 'library_recipes', uuid: match[2]!.toLowerCase() };
}

/** The old app's id prefix for library recipes (mobile/config/libraryRecipes.ts). */
export const LEGACY_LIBRARY_PREFIX = 'library-';

export type RecipeIngredientLine = { name: string; quantity: number; unit: string };

export type SearchableRecipe = {
  /** For links: /recipe/<routeId>. */
  routeId: string;
  table: RecipeTable;
  uuid: string;
  /**
   * The id the old app used for this recipe (recipes: slug, else uuid; library: "library-<slug>").
   * Saved-recipe keys are built from it so both apps agree while they share the table.
   */
  legacyId: string;
  title: string;
  /** Short line under the title: tag or cuisine. */
  subtitle: string;
  description: string;
  minutes: number | null;
  servings: number;
  imageUrl: string | null;
  /** Dish-type tag(s), for the photo placeholder. */
  tags: string[];
  ingredients: RecipeIngredientLine[];
  /** The signed-in person's own recipe (imported or written by them). */
  own: boolean;
};

// --------------------------------------------------------------------- recipes

export type SearchRecipeRow = {
  id: string;
  slug: string | null;
  name: string;
  tag: string | null;
  description: string | null;
  servings: number;
  minutes: number;
  ingredients: unknown; // jsonb
  image_url: string | null;
  is_master: boolean;
  created_by: string | null;
};

export const SEARCH_RECIPE_COLUMNS = 'id, slug, name, tag, description, servings, minutes, ingredients, image_url, is_master, created_by';

// ------------------------------------------------------------- library_recipes

export type SearchLibraryRow = {
  id: string;
  slug: string;
  title: string;
  dish_name: string;
  servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: unknown; // jsonb
  tags: string[] | null;
  cuisine: string | null;
  image_url: string | null;
};

export const SEARCH_LIBRARY_COLUMNS =
  'id, slug, title, dish_name, servings, prep_minutes, cook_minutes, ingredients, tags, cuisine, image_url';

// --------------------------------------------------------------------- mapping

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Ingredient lines from a jsonb array of { name, quantity, unit, note? }; anything else is skipped. */
export function ingredientLines(raw: unknown): RecipeIngredientLine[] {
  if (!Array.isArray(raw)) return [];
  const out: RecipeIngredientLine[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const name = text(row.name);
    if (!name) continue;
    const quantity = typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : 1;
    const unit = text(row.unit) || 'each';
    out.push({ name, quantity, unit });
  }
  return out;
}

export function searchableFromRecipeRow(row: SearchRecipeRow, userId: string | null): SearchableRecipe | null {
  if (!isUuid(row.id)) return null;
  const title = text(row.name);
  if (!title) return null;
  const slug = text(row.slug);
  return {
    routeId: recipeRouteId('recipes', row.id),
    table: 'recipes',
    uuid: row.id,
    legacyId: slug || row.id,
    title,
    subtitle: text(row.tag),
    description: text(row.description),
    minutes: typeof row.minutes === 'number' && row.minutes > 0 ? row.minutes : null,
    servings: Math.max(1, typeof row.servings === 'number' ? row.servings : 4),
    imageUrl: imageAddress(row.image_url),
    tags: [text(row.tag)].filter(Boolean),
    ingredients: ingredientLines(row.ingredients),
    own: !row.is_master && userId !== null && row.created_by === userId,
  };
}

export function searchableFromLibraryRow(row: SearchLibraryRow): SearchableRecipe | null {
  if (!isUuid(row.id)) return null;
  const slug = text(row.slug);
  const title = text(row.title) || text(row.dish_name);
  if (!slug || !title) return null;
  const prep = typeof row.prep_minutes === 'number' ? row.prep_minutes : 0;
  const cook = typeof row.cook_minutes === 'number' ? row.cook_minutes : 0;
  const firstTag = Array.isArray(row.tags) ? row.tags.map(text).find(Boolean) ?? '' : '';
  return {
    routeId: recipeRouteId('library_recipes', row.id),
    table: 'library_recipes',
    uuid: row.id,
    legacyId: `${LEGACY_LIBRARY_PREFIX}${slug}`,
    title,
    subtitle: text(row.cuisine) || firstTag,
    description: text(row.dish_name),
    minutes: prep + cook > 0 ? prep + cook : null,
    servings: Math.max(1, typeof row.servings === 'number' ? row.servings : 4),
    imageUrl: imageAddress(row.image_url),
    tags: Array.isArray(row.tags) ? row.tags.map(text).filter(Boolean) : [],
    ingredients: ingredientLines(row.ingredients),
    own: false,
  };
}
