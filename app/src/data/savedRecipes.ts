import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataError, retryUnlessPermanent, run } from './errors';
import { SIGNED_OUT } from './keys';
import { addItem, replaceItem, tempId } from './listOps';
import { isOnlineNow } from './online';
import { listMutation } from './optimistic';
import { isUuid } from './recipeSearchRows';
import {
  SAVED_RECIPE_COLUMNS,
  isTargetSaved,
  placeholderSaved,
  refKeysToRemove,
  removeMatching,
  savedInsertColumns,
  savedRecipeFromRow,
  slugsToResolve,
  type SaveTarget,
  type SavedRecipe,
  type SavedRecipeRow,
  type SlugLookup,
} from './savedRecipeRows';
import { requireClient, requireUserId, useSessionUserId } from './session';

export {
  saveTargetForCreatorVideo,
  saveTargetForRecipe,
  saveTargetFromSaved,
  type SaveTarget,
  type SaveableRecipe,
  type SavedLink,
  type SavedRecipe,
} from './savedRecipeRows';

/**
 * Saved recipes: the person's own user_saved_recipes rows. Same rules as the rest of the data
 * layer (src/data/README.md): the query cache is the only copy, save and unsave are small
 * optimistic changes that roll back if the server refuses, and the server's row wins.
 */

// ------------------------------------------------------------------------ keys

export const savedRecipeKeys = {
  all: ['saved-recipes'] as const,
  list: (userId: string | null | undefined) => ['saved-recipes', userId ? userId : SIGNED_OUT, 'list'] as const,
} as const;

export const savedRecipeMutationKeys = {
  all: ['saved-recipes'] as const,
  toggle: () => ['saved-recipes', 'toggle'] as const,
} as const;

/** Most slugs looked up in one go (old app rows saved without a uuid). */
const MAX_LOOKUP = 200;

// ---------------------------------------------------------------------- server

async function lookupSlugs(owner: string, recipeSlugs: string[], librarySlugs: string[]): Promise<SlugLookup> {
  const client = requireClient();
  const recipes = new Map<string, string>();
  const library = new Map<string, string>();
  const [recipeRows, libraryRows] = await Promise.all([
    recipeSlugs.length
      ? run<{ id: string; slug: string | null }[]>(
          client
            .from('recipes')
            .select('id, slug')
            .in('slug', recipeSlugs.slice(0, MAX_LOOKUP))
            .or(`is_master.eq.true,created_by.eq.${owner}`),
        )
      : Promise.resolve([]),
    librarySlugs.length
      ? run<{ id: string; slug: string }[]>(
          client.from('library_recipes').select('id, slug').eq('status', 'published').in('slug', librarySlugs.slice(0, MAX_LOOKUP)),
        )
      : Promise.resolve([]),
  ]);
  for (const row of recipeRows) if (row.slug && isUuid(row.id)) recipes.set(row.slug, row.id.toLowerCase());
  for (const row of libraryRows) if (row.slug && isUuid(row.id)) library.set(row.slug, row.id.toLowerCase());
  return { recipes, library };
}

/** The signed-in person's saved items, newest first, each with where it leads. */
export async function fetchSavedRecipes(userId: string | null | undefined): Promise<SavedRecipe[]> {
  const client = requireClient();
  const owner = requireUserId(userId);
  if (!isUuid(owner)) throw new DataError('invalid', 'Sign in again to see saved recipes.');
  const rows = await run<SavedRecipeRow[]>(
    client
      .from('user_saved_recipes')
      .select(SAVED_RECIPE_COLUMNS)
      .eq('user_id', owner)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }),
  );
  const recipeSlugs = new Set<string>();
  const librarySlugs = new Set<string>();
  for (const row of rows) {
    const need = slugsToResolve(row);
    need.recipes.forEach((s) => recipeSlugs.add(s));
    need.library.forEach((s) => librarySlugs.add(s));
  }
  const lookup =
    recipeSlugs.size || librarySlugs.size ? await lookupSlugs(owner, [...recipeSlugs], [...librarySlugs]) : undefined;
  return rows.map((row) => savedRecipeFromRow(row, lookup));
}

export async function saveRecipe(userId: string | null | undefined, target: SaveTarget): Promise<SavedRecipe> {
  const client = requireClient();
  const owner = requireUserId(userId);
  const row = await run<SavedRecipeRow>(
    client
      .from('user_saved_recipes')
      .upsert(savedInsertColumns(owner, target), { onConflict: 'user_id,ref_key' })
      .select(SAVED_RECIPE_COLUMNS)
      .single(),
  );
  return savedRecipeFromRow(row);
}

export async function unsaveRecipe(userId: string | null | undefined, refKeys: readonly string[]): Promise<null> {
  const client = requireClient();
  const owner = requireUserId(userId);
  if (refKeys.length === 0) return null;
  await run<unknown[]>(client.from('user_saved_recipes').delete().eq('user_id', owner).in('ref_key', [...refKeys]).select('id'));
  return null;
}

// ----------------------------------------------------------------------- hooks

export function useSavedRecipes() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: savedRecipeKeys.list(userId),
    queryFn: () => fetchSavedRecipes(userId),
    enabled: !session.isPending,
    retry: retryUnlessPermanent,
  });
}

export type ToggleSavedVars = {
  target: SaveTarget;
  /** true to save, false to unsave. */
  save: boolean;
  /** Placeholder id for the optimistic row (save only). */
  tempId: string;
  /** Keys to delete (unsave only): from refKeysToRemove. */
  refKeys: string[];
};

/** Save or unsave one thing. Prefer useSaveToggle(target), which works out the variables. */
export function useToggleSavedRecipe() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const queryKey = savedRecipeKeys.list(userId);
  return useMutation({
    mutationKey: savedRecipeMutationKeys.toggle(),
    mutationFn: (vars: ToggleSavedVars): Promise<SavedRecipe | null> => (vars.save ? saveRecipe(userId, vars.target) : unsaveRecipe(userId, vars.refKeys)),
    ...listMutation<SavedRecipe, ToggleSavedVars, SavedRecipe | null>({
      queryClient,
      queryKey,
      mutationKey: savedRecipeMutationKeys.all,
      change: (vars) => (vars.save ? addItem(placeholderSaved(vars.tempId, vars.target), 'start') : removeMatching(vars.target)),
      applyResult: (list, result, vars) => (result ? replaceItem(list, result, vars.tempId) : [...list]),
      isOnline: isOnlineNow,
    }),
  });
}

/**
 * Saved state and toggle for one thing, for SaveButton.
 *   const s = useSaveToggle(saveTargetForRecipe(recipe));
 *   s.saved, s.toggle(), s.busy, s.error
 */
export function useSaveToggle(target: SaveTarget) {
  const saved = useSavedRecipes();
  const toggle = useToggleSavedRecipe();
  const isSaved = isTargetSaved(saved.data, target);
  return {
    saved: isSaved,
    /** False until the saved list has loaded (the button can't know which way to go before that). */
    ready: saved.data !== undefined,
    busy: toggle.isPending,
    error: toggle.error instanceof Error ? toggle.error.message : null,
    toggle: () => {
      if (saved.data === undefined || toggle.isPending) return;
      toggle.mutate({
        target,
        save: !isSaved,
        tempId: tempId(),
        refKeys: isSaved ? refKeysToRemove(saved.data, target) : [],
      });
    },
  };
}
