import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataError, retryUnlessPermanent, run } from './errors';
import { SIGNED_OUT } from './keys';
import {
  LIBRARY_RECIPE_COLUMNS,
  libraryRecipeFromRow,
  parseRecipeRouteId,
  RECIPE_COLUMNS,
  recipeFromRow,
  type AppRecipe,
  type LibraryRecipeRow,
  type RecipeRow,
} from './recipeRows';
import { requireClient, requireUserId, useSessionUserId } from './session';

export type { AppRecipe, RecipeCredit, RecipeSource } from './recipeRows';
export { parseRecipeRouteId, recipeHref, recipeRouteId, servingsAndTime } from './recipeRows';

/**
 * Recipes, read from the server: public.recipes (master recipes plus the person's own) and the
 * published rows of public.library_recipes. Read-only here; same rules as the rest of the data
 * layer (src/data/README.md). Matching against the pantry is done by the screens with the pure
 * functions in src/kitchen/recipeFeed.ts, on the pantry query's data.
 */

export const recipeKeys = {
  all: ['recipes'] as const,
  list: (userId: string | null | undefined) => ['recipes', userId ? userId : SIGNED_OUT, 'list'] as const,
  detail: (userId: string | null | undefined, id: string) => ['recipes', userId ? userId : SIGNED_OUT, 'detail', id] as const,
} as const;

/** Library rows read at most (the feed shows the best matches; the rest stay on the server). */
export const LIBRARY_READ_LIMIT = 500;

export const RECIPE_NOT_FOUND = "That recipe wasn't found. It may have been removed.";

/** Master recipes, the person's own recipes, then the published library. */
export async function fetchRecipes(userId: string | null | undefined): Promise<AppRecipe[]> {
  const client = requireClient();
  const id = requireUserId(userId);
  // recipes_read lets every signed-in person read every row, so limit to master + own here.
  const [own, library] = await Promise.all([
    run<RecipeRow[]>(
      client
        .from('recipes')
        .select(RECIPE_COLUMNS)
        .or(`is_master.eq.true,created_by.eq.${id}`)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ),
    run<LibraryRecipeRow[]>(
      client
        .from('library_recipes')
        .select(LIBRARY_RECIPE_COLUMNS)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(LIBRARY_READ_LIMIT),
    ),
  ]);
  return [...own.map(recipeFromRow), ...library.map(libraryRecipeFromRow)];
}

/** One recipe by route id (r_<uuid> / l_<uuid>). Someone else's own recipe reads as not found. */
export async function fetchRecipe(userId: string | null | undefined, routeId: string): Promise<AppRecipe> {
  const client = requireClient();
  const owner = requireUserId(userId);
  const parsed = parseRecipeRouteId(routeId);
  if (!parsed) throw new DataError('not-found', RECIPE_NOT_FOUND);
  if (parsed.source === 'recipes') {
    const rows = await run<RecipeRow[]>(
      client.from('recipes').select(RECIPE_COLUMNS).eq('id', parsed.rowId).or(`is_master.eq.true,created_by.eq.${owner}`).limit(1),
    );
    const row = rows[0];
    if (!row) throw new DataError('not-found', RECIPE_NOT_FOUND);
    return recipeFromRow(row);
  }
  const rows = await run<LibraryRecipeRow[]>(
    client.from('library_recipes').select(LIBRARY_RECIPE_COLUMNS).eq('id', parsed.rowId).eq('status', 'published').limit(1),
  );
  const row = rows[0];
  if (!row) throw new DataError('not-found', RECIPE_NOT_FOUND);
  return libraryRecipeFromRow(row);
}

export function useRecipes() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: recipeKeys.list(userId),
    queryFn: () => fetchRecipes(userId),
    enabled: !session.isPending,
    retry: retryUnlessPermanent,
  });
}

/** One recipe; shows the feed's copy at once while the server's row loads. */
export function useRecipe(routeId: string) {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: recipeKeys.detail(userId, routeId),
    queryFn: () => fetchRecipe(userId, routeId),
    enabled: !session.isPending,
    retry: retryUnlessPermanent,
    placeholderData: () => queryClient.getQueryData<AppRecipe[]>(recipeKeys.list(userId))?.find((r) => r.id === routeId),
  });
}
