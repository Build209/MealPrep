/**
 * Recipe rows from two tables (db/supabase/migrations/20261013000000_live_baseline.sql), mapped
 * to one app type, plus the recipe id scheme. No network, so tests can run it
 * (tests/recipe-rows.test.ts).
 *
 * RECIPE ID SCHEME (route /recipe/[id], and the id in grocery source_recipe_ids):
 *   r_<uuid>  a row of public.recipes (master recipes and the person's own imports)
 *   l_<uuid>  a published row of public.library_recipes
 * Build links with recipeHref(source, rowId) or recipeRouteId(source, rowId); never parse the
 * prefix yourself. Slugs are not used: user recipes may have none, and ids never change.
 */
import type { MissingGroceryLine } from '../kitchen/recipeFeed';
import type { RecipeIngredientLine } from '../kitchen/recipeStock';
import { DataError, messages, toDataError } from './errors';
import { groceryItemFromRow, type GroceryItem, type GroceryItemRow } from './groceryRows';

// ------------------------------------------------------------------ id scheme

export type RecipeSource = 'recipes' | 'library';

const PREFIX: Record<RecipeSource, string> = { recipes: 'r_', library: 'l_' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function recipeRouteId(source: RecipeSource, rowId: string): string {
  return `${PREFIX[source]}${rowId}`;
}

export function recipeHref(source: RecipeSource, rowId: string): `/recipe/${string}` {
  return `/recipe/${recipeRouteId(source, rowId)}`;
}

/** The table and row id a route id points at, or null when it isn't one of ours. */
export function parseRecipeRouteId(id: string | null | undefined): { source: RecipeSource; rowId: string } | null {
  if (typeof id !== 'string') return null;
  const source: RecipeSource | null = id.startsWith('r_') ? 'recipes' : id.startsWith('l_') ? 'library' : null;
  if (!source) return null;
  const rowId = id.slice(2).toLowerCase();
  return UUID.test(rowId) ? { source, rowId } : null;
}

// ------------------------------------------------------------------ app type

export type RecipeCredit = {
  /** The creator or site name ("By ..."). */
  creatorName: string | null;
  creatorUrl: string | null;
  /** Where the recipe came from. */
  originalUrl: string | null;
  /** Full credit line for outside-source recipes, e.g. "Source: Wikibooks Cookbook, CC BY-SA 4.0". */
  sourceLine?: string;
};

export type AppRecipe = {
  /** Route id (r_<uuid> / l_<uuid>). */
  id: string;
  source: RecipeSource;
  rowId: string;
  /**
   * The row's slug (recipes: may be null; library: always set). Not used for links; the old
   * app's saved-recipe keys are built from it (saveableFromAppRecipe in savedRecipeRows.ts).
   */
  slug: string | null;
  name: string;
  description: string;
  servings: number;
  /** Total minutes, or null when unknown. */
  minutes: number | null;
  imageUrl: string | null;
  ingredients: RecipeIngredientLine[];
  steps: string[];
  /** A MealPlanatic recipe (master or library), not the person's own. */
  isMealPlanatic: boolean;
  credit: RecipeCredit | null;
  createdAt: string;
};

// ------------------------------------------------------------- public.recipes

export type RecipeRow = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  servings: number;
  minutes: number;
  ingredients: unknown; // jsonb [{ ingredientId, name, quantity, unit }]
  steps: unknown; // jsonb string[]
  is_master: boolean;
  created_by: string | null;
  created_at: string;
  source_url: string | null;
  source_type: string | null;
  source_title: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source_channel_name: string | null;
  source_channel_url: string | null;
  source_author_url: string | null;
  image_url: string | null;
};

export const RECIPE_COLUMNS =
  'id, slug, name, description, servings, minutes, ingredients, steps, is_master, created_by, created_at, source_url, ' +
  'source_type, source_title, prep_minutes, cook_minutes, source_channel_name, source_channel_url, source_author_url, image_url';

// ----------------------------------------------------- public.library_recipes

export type LibraryRecipeRow = {
  id: string;
  slug: string;
  title: string;
  dish_name: string;
  servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: unknown; // jsonb [{ name, quantity, unit, note }]
  steps: unknown; // jsonb string[]
  image_url: string | null;
  created_at: string;
  /** Set for recipes taken from an outside source, e.g. 'Wikibooks Cookbook'. Null for MealPlanatic's own. */
  source_name?: string | null;
  source_url?: string | null;
  /** e.g. 'CC BY-SA 4.0'. */
  license?: string | null;
};

export const LIBRARY_RECIPE_COLUMNS =
  'id, slug, title, dish_name, servings, prep_minutes, cook_minutes, ingredients, steps, image_url, created_at, source_name, source_url, license';

/** Credit for a library recipe from an outside source: "Source: Wikibooks Cookbook, CC BY-SA 4.0" linking the original page. */
export function creditFromLibraryRow(row: Pick<LibraryRecipeRow, 'source_name' | 'source_url' | 'license'>): RecipeCredit | null {
  const name = text(row.source_name);
  if (!name) return null;
  const license = text(row.license);
  return {
    creatorName: null,
    creatorUrl: null,
    originalUrl: safeHttpUrl(row.source_url),
    sourceLine: `Source: ${name}${license ? `, ${license}` : ''}`,
  };
}

// ------------------------------------------------------------------- mappers

/** Only http(s) links are shown (old app: sanitizeHttpUrl). */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function stepsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ingredient';
}

/** recipes.ingredients: [{ ingredientId, name, quantity, unit }] (snake_case id tolerated). */
export function recipeIngredientsFromJson(value: unknown): RecipeIngredientLine[] {
  if (!Array.isArray(value)) return [];
  const out: RecipeIngredientLine[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = text(r.name);
    if (!name) continue;
    const id = text(r.ingredientId) || text(r.ingredient_id) || slugOf(name);
    out.push({ ingredientId: id, name, quantity: num(r.quantity) ?? 0, unit: text(r.unit) });
  }
  return out;
}

/** library_recipes.ingredients: [{ name, quantity, unit, note }] (old app: mapToAppRecipe). */
export function libraryIngredientsFromJson(value: unknown, slug: string): RecipeIngredientLine[] {
  if (!Array.isArray(value)) return [];
  const out: RecipeIngredientLine[] = [];
  value.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    const name = text(r.name);
    if (!name) return;
    const note = text(r.note);
    out.push({
      ingredientId: `lib-${slug}-${out.length}`,
      name: note ? `${name} (${note})` : name,
      quantity: num(r.quantity) ?? 1,
      unit: text(r.unit) || 'each',
    });
  });
  return out;
}

/** Old app: sourceCreditFromRecipe (YouTube credits the channel; others the title and author link). */
export function creditFromRecipeRow(row: Pick<RecipeRow, 'source_url' | 'source_type' | 'source_title' | 'source_channel_name' | 'source_channel_url' | 'source_author_url'>): RecipeCredit | null {
  const originalUrl = safeHttpUrl(row.source_url);
  const youtube = row.source_type === 'youtube';
  const creatorName = (youtube ? text(row.source_channel_name) : text(row.source_title)) || null;
  const creatorUrl = safeHttpUrl(youtube ? row.source_channel_url : row.source_author_url);
  if (!creatorName && !originalUrl) return null;
  return { creatorName, creatorUrl, originalUrl };
}

export function recipeFromRow(row: RecipeRow): AppRecipe {
  const prep = num(row.prep_minutes);
  const cook = num(row.cook_minutes);
  const split = (prep ?? 0) + (cook ?? 0);
  const minutes = num(row.minutes);
  return {
    id: recipeRouteId('recipes', row.id),
    source: 'recipes',
    rowId: row.id,
    slug: text(row.slug) || null,
    name: text(row.name) || 'Untitled recipe',
    description: text(row.description),
    servings: Math.max(1, num(row.servings) ?? 1),
    minutes: minutes && minutes > 0 ? minutes : split > 0 ? split : null,
    imageUrl: safeHttpUrl(row.image_url),
    ingredients: recipeIngredientsFromJson(row.ingredients),
    steps: stepsFromJson(row.steps),
    isMealPlanatic: row.is_master === true,
    credit: creditFromRecipeRow(row),
    createdAt: row.created_at,
  };
}

export function libraryRecipeFromRow(row: LibraryRecipeRow): AppRecipe {
  const total = (num(row.prep_minutes) ?? 0) + (num(row.cook_minutes) ?? 0);
  return {
    id: recipeRouteId('library', row.id),
    source: 'library',
    rowId: row.id,
    slug: text(row.slug) || null,
    name: text(row.title) || text(row.dish_name) || 'Untitled recipe',
    description: text(row.dish_name),
    servings: Math.max(1, num(row.servings) ?? 1),
    minutes: total > 0 ? total : null,
    imageUrl: safeHttpUrl(row.image_url),
    ingredients: libraryIngredientsFromJson(row.ingredients, text(row.slug) || row.id),
    steps: stepsFromJson(row.steps),
    isMealPlanatic: true,
    credit: creditFromLibraryRow(row),
    createdAt: row.created_at,
  };
}

/** "4 servings · 30 min" (old app wording; time left out when unknown). */
export function servingsAndTime(recipe: Pick<AppRecipe, 'servings' | 'minutes'>): string {
  const servings = `${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'}`;
  return recipe.minutes ? `${servings} · ${recipe.minutes} min` : servings;
}

// ------------------------------------------------------- add missing to grocery

/** The answer of public.add_missing_to_grocery (db/supabase/migrations/20261014030000_add_missing_to_grocery.sql). */
export type AddMissingResult = {
  /** Every grocery row the call changed or found already covering this recipe, as the server has it. */
  rows: GroceryItem[];
  added: number;
  merged: number;
  unchanged: number;
};

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function addMissingResultFromJson(raw: unknown): AddMissingResult {
  const answer = (raw ?? {}) as { rows?: unknown; added?: unknown; merged?: unknown; unchanged?: unknown };
  if (!Array.isArray(answer.rows)) throw new DataError('server', messages.server);
  const rows = answer.rows.filter((row): row is GroceryItemRow => !!row && typeof row === 'object').map(groceryItemFromRow);
  return { rows, added: count(answer.added), merged: count(answer.merged), unchanged: count(answer.unchanged) };
}

/** The rpc's p_items body (snake_case). */
export function addMissingItemsBody(lines: readonly MissingGroceryLine[]) {
  return lines.map((line) => ({
    ingredient_id: line.ingredientId,
    name: line.name,
    category: line.category,
    quantity: line.quantity,
    unit: line.unit,
  }));
}

/** A missing function (not applied to this database yet) gets its own plain message. */
export function addMissingRpcError(error: unknown): DataError {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'PGRST202' || code === '42883') {
    return new DataError('server', "Adding to the grocery list isn't available on this server yet.", { cause: error });
  }
  if (code === '22023') return new DataError('invalid', "Those items couldn't be added.", { cause: error });
  return toDataError(error);
}

/** Put the server's rows into a grocery list (replace by id, or add), kept in name order. */
export function upsertGroceryRows(list: readonly GroceryItem[], rows: readonly GroceryItem[]): GroceryItem[] {
  const byId = new Map(list.map((item) => [item.id, item]));
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** True when every missing line already has an open grocery row that lists this recipe. */
export function missingAlreadyOnList(
  recipeId: string,
  lines: readonly Pick<MissingGroceryLine, 'ingredientId' | 'name' | 'unit'>[],
  grocery: readonly GroceryItem[],
): boolean {
  if (lines.length === 0) return false;
  const lower = (s: string) => s.trim().toLowerCase();
  return lines.every((line) =>
    grocery.some(
      (row) =>
        !row.checked &&
        row.sourceRecipeIds.includes(recipeId) &&
        lower(row.unit) === lower(line.unit) &&
        (row.ingredientId === line.ingredientId || lower(row.name) === lower(line.name)),
    ),
  );
}
