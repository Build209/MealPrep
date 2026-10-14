import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MissingGroceryLine } from '../kitchen/recipeFeed';
import { DataError, messages, offlineError } from './errors';
import { groceryKeys, groceryMutationKeys } from './grocery';
import type { GroceryItem } from './groceryRows';
import { isOnlineNow } from './online';
import {
  addMissingItemsBody,
  addMissingResultFromJson,
  addMissingRpcError,
  parseRecipeRouteId,
  upsertGroceryRows,
  type AddMissingResult,
} from './recipeRows';
import { requireClient, requireUserId, useSessionUserId } from './session';

export type { AddMissingResult } from './recipeRows';

/**
 * "Add N missing to grocery list": ONE server call (public.add_missing_to_grocery). The server
 * merges each line into an open grocery row of the same thing and unit (adding the quantity once
 * per recipe) or inserts an 'add_missing' row with the recipe id in source_recipe_ids, so a
 * double tap or a second device adds nothing twice. The app keeps no copy: the server's rows go
 * into the grocery list query, which then refetches.
 */

export type AddMissingVars = {
  /** Route id (r_<uuid> / l_<uuid>), stored in source_recipe_ids. */
  recipeId: string;
  lines: readonly MissingGroceryLine[];
};

export async function addMissingToGrocery(userId: string | null | undefined, vars: AddMissingVars): Promise<AddMissingResult> {
  if (!parseRecipeRouteId(vars.recipeId)) throw new DataError('invalid', messages.notFound);
  if (!isOnlineNow()) throw offlineError();
  const client = requireClient();
  requireUserId(userId);
  if (vars.lines.length === 0) return { rows: [], added: 0, merged: 0, unchanged: 0 };
  const response = await client.rpc('add_missing_to_grocery', {
    p_recipe_id: vars.recipeId,
    p_items: addMissingItemsBody(vars.lines),
  });
  if (response.error) throw addMissingRpcError(response.error);
  return addMissingResultFromJson(response.data);
}

export const addMissingMutationKey = () => [...groceryMutationKeys.all, 'add-missing'] as const;

export function useAddMissingToGrocery() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const listKey = groceryKeys.list(userId);
  return useMutation({
    mutationKey: addMissingMutationKey(),
    mutationFn: (vars: AddMissingVars) => addMissingToGrocery(userId, vars),
    onSuccess: (result: AddMissingResult) => {
      queryClient.setQueryData<GroceryItem[]>(listKey, (list) => (list ? upsertGroceryRows(list, result.rows) : list));
    },
    onSettled: async () => {
      // Refetch the list unless another grocery change is still waiting (this one counts as running).
      if (queryClient.isMutating({ mutationKey: groceryMutationKeys.all }) > 1) return;
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}
