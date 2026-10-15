import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { DataError, messages, run } from './errors';
import { groceryKeys, groceryMutationKeys } from './grocery';
import {
  GROCERY_ITEM_COLUMNS,
  groceryInsertColumns,
  groceryItemFromRow,
  groceryRestoreColumns,
  groceryRpcError,
  placeholderGroceryItem,
  removeChecked,
  restoreMany,
  tickResultFromJson,
  untickResultFromJson,
  upsertPantryRow,
  validateGroceryFields,
  type AddGroceryItemVars,
  type GroceryItem,
  type GroceryItemRow,
  type TickGroceryVars,
  type TickResult,
  type UntickGroceryVars,
  type UntickResult,
} from './groceryRows';
import { keys, mutationKeys } from './keys';
import { addItem, replaceItem, tempId, updateItem } from './listOps';
import { isOnlineNow } from './online';
import { listMutation } from './optimistic';
import type { PantryItem } from './rows';
import { requireClient, requireUserId, useSessionUserId } from './session';

export type { AddGroceryItemVars, TickGroceryVars, UntickGroceryVars } from './groceryRows';

/**
 * Grocery changes: add, tick (into the pantry), untick (undo), clear ticked and undo clear.
 *
 * Tick and untick are ONE server call each (public.tick_grocery_item / untick_grocery_item in
 * db/supabase/migrations/20261014000000_grocery_tick.sql): the server locks the grocery row,
 * changes the pantry row and marks the grocery row in one transaction. The app never adds stock
 * itself, so a tick can't save a different row from the one on screen, and a second tick (double
 * tap, retry, another device) adds nothing. The screen only shows the tick at once
 * (optimistic) and takes the server's rows for both lists when it answers.
 */

export function newGroceryItemVars(fields: Omit<AddGroceryItemVars, 'tempId'>): AddGroceryItemVars {
  return { ...fields, tempId: tempId() };
}

// ---------------------------------------------------------------------- server

export async function insertGroceryItem(userId: string | null | undefined, vars: AddGroceryItemVars): Promise<GroceryItem> {
  validateGroceryFields(vars);
  const client = requireClient();
  const owner = requireUserId(userId);
  const row = await run<GroceryItemRow>(
    client.from('grocery_list_items').insert(groceryInsertColumns(owner, vars)).select(GROCERY_ITEM_COLUMNS).single(),
  );
  return groceryItemFromRow(row);
}

export async function tickGroceryItem(userId: string | null | undefined, vars: TickGroceryVars): Promise<TickResult> {
  const client = requireClient();
  requireUserId(userId);
  let data: unknown;
  try {
    data = await rpc(client.rpc('tick_grocery_item', {
      p_grocery_id: vars.id,
      p_pantry_item_id: vars.pantryItemId,
      p_location: vars.location,
    }));
  } catch (error) {
    throw groceryRpcError(error);
  }
  return tickResultFromJson(data);
}

export async function untickGroceryItem(userId: string | null | undefined, vars: UntickGroceryVars): Promise<UntickResult> {
  const client = requireClient();
  requireUserId(userId);
  let data: unknown;
  try {
    data = await rpc(client.rpc('untick_grocery_item', {
      p_grocery_id: vars.id,
      p_pantry_item_id: vars.pantryItemId,
      p_created: vars.created,
    }));
  } catch (error) {
    throw groceryRpcError(error);
  }
  return untickResultFromJson(data);
}

/** Deletes every ticked row and returns them as the server had them (for Undo). */
export async function clearCheckedGroceryItems(userId: string | null | undefined): Promise<GroceryItem[]> {
  const client = requireClient();
  const owner = requireUserId(userId);
  const rows = await run<GroceryItemRow[]>(
    client.from('grocery_list_items').delete().eq('user_id', owner).eq('checked', true).select(GROCERY_ITEM_COLUMNS),
  );
  return rows.map(groceryItemFromRow);
}

/** Puts cleared rows back with the same ids and values. */
export async function restoreGroceryItems(userId: string | null | undefined, rows: readonly GroceryItem[]): Promise<GroceryItem[]> {
  const client = requireClient();
  const owner = requireUserId(userId);
  if (rows.length === 0) return [];
  if (rows.some((row) => row.userId !== owner)) throw new DataError('forbidden', messages.forbidden);
  const saved = await run<GroceryItemRow[]>(
    client
      .from('grocery_list_items')
      .insert(rows.map((row) => groceryRestoreColumns(owner, row)))
      .select(GROCERY_ITEM_COLUMNS),
  );
  return saved.map(groceryItemFromRow);
}

/** An rpc call's data, or its raw error thrown (mapped by the caller). */
async function rpc(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown> {
  const response = await request;
  if (response.error) throw response.error;
  return response.data;
}

// ----------------------------------------------------------------------- hooks

function useGroceryScope() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return { queryClient, userId, queryKey: groceryKeys.list(userId), pantryKey: keys.pantry.list(userId) };
}

/** Put the server's pantry row into the pantry list on screen (if that list is loaded). */
function showPantryRow(queryClient: QueryClient, pantryKey: readonly unknown[], row: PantryItem, deleted = false) {
  queryClient.setQueryData<PantryItem[]>(pantryKey, (list) => {
    if (!list) return list;
    return deleted ? list.filter((item) => item.id !== row.id) : upsertPantryRow(list, row);
  });
}

/** Refetch the pantry, unless a pantry change is still waiting for the server. */
async function refreshPantry(queryClient: QueryClient, pantryKey: readonly unknown[]) {
  if (queryClient.isMutating({ mutationKey: mutationKeys.pantry.all }) > 0) return;
  await queryClient.invalidateQueries({ queryKey: pantryKey });
}

/**
 *   const add = useAddGroceryItem();
 *   add.mutate(newGroceryItemVars(manualGroceryFields({ name, quantity, unit })));
 */
export function useAddGroceryItem() {
  const { queryClient, userId, queryKey } = useGroceryScope();
  return useMutation({
    mutationKey: groceryMutationKeys.add(),
    mutationFn: (vars: AddGroceryItemVars) => insertGroceryItem(userId, vars),
    ...listMutation<GroceryItem, AddGroceryItemVars, GroceryItem>({
      queryClient,
      queryKey,
      mutationKey: groceryMutationKeys.all,
      change: (vars) => {
        validateGroceryFields(vars);
        return addItem(placeholderGroceryItem(userId, vars));
      },
      applyResult: (list, row, vars) => replaceItem(list, row, vars.tempId),
      isOnline: isOnlineNow,
    }),
  });
}

/**
 * Tick one row: it moves into the pantry on the server. On success `data` is the tick's
 * answer; pass `{ id, pantryItemId: data.pantry?.id, created: data.created }` to
 * useUntickGroceryItem for Undo.
 */
export function useTickGroceryItem() {
  const { queryClient, userId, queryKey, pantryKey } = useGroceryScope();
  const base = listMutation<GroceryItem, TickGroceryVars, TickResult>({
    queryClient,
    queryKey,
    mutationKey: groceryMutationKeys.all,
    change: ({ id }) => updateItem<GroceryItem>(id, { checked: true }),
    applyResult: (list, result) => replaceItem(list, result.grocery),
    isOnline: isOnlineNow,
  });
  return useMutation({
    mutationKey: groceryMutationKeys.tick(),
    mutationFn: (vars: TickGroceryVars) => tickGroceryItem(userId, vars),
    ...base,
    onSuccess: (result: TickResult, vars: TickGroceryVars) => {
      base.onSuccess(result, vars);
      if (result.pantry) showPantryRow(queryClient, pantryKey, result.pantry);
    },
    onSettled: async () => {
      await Promise.all([base.onSettled(), refreshPantry(queryClient, pantryKey)]);
    },
  });
}

/** Untick one row (Undo of a tick): the server takes the stock back out of the pantry. */
export function useUntickGroceryItem() {
  const { queryClient, userId, queryKey, pantryKey } = useGroceryScope();
  const base = listMutation<GroceryItem, UntickGroceryVars, UntickResult>({
    queryClient,
    queryKey,
    mutationKey: groceryMutationKeys.all,
    change: ({ id }) => updateItem<GroceryItem>(id, { checked: false }),
    applyResult: (list, result) => replaceItem(list, result.grocery),
    isOnline: isOnlineNow,
  });
  return useMutation({
    mutationKey: groceryMutationKeys.untick(),
    mutationFn: (vars: UntickGroceryVars) => untickGroceryItem(userId, vars),
    ...base,
    onSuccess: (result: UntickResult, vars: UntickGroceryVars) => {
      base.onSuccess(result, vars);
      if (result.pantry) showPantryRow(queryClient, pantryKey, result.pantry, result.deleted);
    },
    onSettled: async () => {
      await Promise.all([base.onSettled(), refreshPantry(queryClient, pantryKey)]);
    },
  });
}

/** Delete every ticked row (they are already in the pantry). On success `data` is the removed rows, for Undo. */
export function useClearCheckedGroceryItems() {
  const { queryClient, userId, queryKey } = useGroceryScope();
  return useMutation({
    mutationKey: groceryMutationKeys.clearChecked(),
    mutationFn: (_vars: void) => clearCheckedGroceryItems(userId),
    ...listMutation<GroceryItem, void, GroceryItem[]>({
      queryClient,
      queryKey,
      mutationKey: groceryMutationKeys.all,
      change: () => removeChecked<GroceryItem>(),
      applyResult: (list, removed) => {
        const ids = new Set(removed.map((row) => row.id));
        return list.filter((item) => !ids.has(item.id));
      },
      isOnline: isOnlineNow,
    }),
  });
}

/** Undo of Clear ticked: the same rows go back through the server (no pantry change). */
export function useRestoreGroceryItems() {
  const { queryClient, userId, queryKey } = useGroceryScope();
  return useMutation({
    mutationKey: groceryMutationKeys.restore(),
    mutationFn: (rows: readonly GroceryItem[]) => restoreGroceryItems(userId, rows),
    ...listMutation<GroceryItem, readonly GroceryItem[], GroceryItem[]>({
      queryClient,
      queryKey,
      mutationKey: groceryMutationKeys.all,
      change: (rows) => restoreMany<GroceryItem>(rows),
      applyResult: (list, saved) => saved.reduce<GroceryItem[]>((acc, row) => replaceItem(acc, row), [...list]),
      isOnline: isOnlineNow,
    }),
  });
}
