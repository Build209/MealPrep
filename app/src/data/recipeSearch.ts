import { useQuery } from '@tanstack/react-query';
import { DataError, retryUnlessPermanent, run } from './errors';
import { readAllPages } from './libraryPaging';
import { SIGNED_OUT } from './keys';
import {
  SEARCH_LIBRARY_COLUMNS,
  SEARCH_RECIPE_COLUMNS,
  isUuid,
  searchableFromLibraryRow,
  searchableFromRecipeRow,
  type SearchLibraryRow,
  type SearchRecipeRow,
  type SearchableRecipe,
} from './recipeSearchRows';
import { requireClient, requireUserId, useSessionUserId } from './session';

export type { SearchableRecipe } from './recipeSearchRows';

/**
 * The recipes search looks through: master recipes, the person's own recipes, and published
 * library recipes. Read once (then kept 10 minutes) and searched on the device by title and
 * ingredient (src/recipes/search/searchLogic.ts), the way the old app searched its loaded recipes.
 *
 * Why not one ilike per keystroke: ingredients are jsonb, and PostgREST can't run ilike on jsonb
 * text without a new database function. Titles alone would miss "chicken" in a stew's ingredients.
 */

export const recipeSearchKeys = {
  all: ['recipe-search'] as const,
  catalog: (userId: string | null | undefined) => ['recipe-search', userId ? userId : SIGNED_OUT, 'catalog'] as const,
} as const;

/** Upper bound for the master + own recipes read (the library is read in pages, see libraryPaging.ts). */
export const CATALOG_LIMIT = 2000;

export async function fetchSearchCatalog(userId: string | null | undefined): Promise<SearchableRecipe[]> {
  const client = requireClient();
  const owner = requireUserId(userId);
  // The id goes into a filter string: refuse anything that is not a uuid.
  if (!isUuid(owner)) throw new DataError('invalid', 'Sign in again to search recipes.');
  const [recipeRows, libraryRows] = await Promise.all([
    run<SearchRecipeRow[]>(
      client
        .from('recipes')
        .select(SEARCH_RECIPE_COLUMNS)
        // recipes_read lets any signed-in person read every row; search shows master + own only.
        .or(`is_master.eq.true,created_by.eq.${owner}`)
        .order('name', { ascending: true })
        .limit(CATALOG_LIMIT),
    ),
    readAllPages<SearchLibraryRow>((from, to) =>
      run<SearchLibraryRow[]>(
        client
          .from('library_recipes')
          .select(SEARCH_LIBRARY_COLUMNS)
          .eq('status', 'published')
          .order('id', { ascending: true })
          .range(from, to),
      ),
    ),
  ]);
  const out: SearchableRecipe[] = [];
  for (const row of recipeRows) {
    const recipe = searchableFromRecipeRow(row, owner);
    if (recipe) out.push(recipe);
  }
  for (const row of libraryRows) {
    const recipe = searchableFromLibraryRow(row);
    if (recipe) out.push(recipe);
  }
  return out;
}

export function useRecipeSearchCatalog(enabled = true) {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: recipeSearchKeys.catalog(userId),
    queryFn: () => fetchSearchCatalog(userId),
    enabled: enabled && !session.isPending,
    staleTime: 10 * 60 * 1000,
    retry: retryUnlessPermanent,
  });
}
