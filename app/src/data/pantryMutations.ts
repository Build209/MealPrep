import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataError, messages, run } from './errors';
import { keys, mutationKeys } from './keys';
import { addItem, removeItem, replaceItem, tempId, updateItem } from './listOps';
import { isOnlineNow } from './online';
import { listMutation } from './optimistic';
import {
  cleanPantryFields,
  pantryFieldsToColumns,
  placeholderPantryItem,
  restoreItem,
  validatePantryFields,
  type AddPantryItemVars,
  type EditPantryItemVars,
  type PantryItemFields,
  type RemovePantryItemVars,
  type RestorePantryItemVars,
} from './pantryFields';
import { PANTRY_ITEM_COLUMNS, pantryItemFromRow, type PantryItem, type PantryItemRow } from './rows';
import { requireClient, requireUserId, useSessionUserId } from './session';

export type {
  AddPantryItemVars,
  EditPantryItemVars,
  PantryItemFields,
  RemovePantryItemVars,
  RestorePantryItemVars,
} from './pantryFields';

/**
 * Add, edit, delete and undo-delete for pantry rows. Same rules as pantry.ts: the screen
 * changes at once, rolls back if the server refuses, and the server's returned row wins.
 *
 * Undo after a delete puts the SAME row back through the server (same id, same values),
 * using the row the server returned from the delete. Nothing is kept on the device.
 */

// ------------------------------------------------------------------------ keys

/** Own mutation keys (each starts with 'pantry', so mutationKeys.pantry.all covers them). */
export const pantryMutationKeys = {
  add: () => ['pantry', 'add'] as const,
  edit: () => ['pantry', 'edit'] as const,
  remove: () => ['pantry', 'remove'] as const,
  restore: () => ['pantry', 'restore'] as const,
} as const;

export function newPantryItemVars(fields: PantryItemFields & { ingredientId: string }): AddPantryItemVars {
  return { ...fields, tempId: tempId() };
}

// ---------------------------------------------------------------------- server

export async function insertPantryItem(userId: string | null | undefined, vars: AddPantryItemVars): Promise<PantryItem> {
  validatePantryFields(vars);
  const client = requireClient();
  const owner = requireUserId(userId);
  const row = await run<PantryItemRow>(
    client
      .from('pantry_items')
      .insert({ user_id: owner, ingredient_id: vars.ingredientId, ...pantryFieldsToColumns(vars) })
      .select(PANTRY_ITEM_COLUMNS)
      .single(),
  );
  return pantryItemFromRow(row);
}

export async function editPantryItem(
  userId: string | null | undefined,
  { id, patch }: EditPantryItemVars,
): Promise<PantryItem> {
  validatePantryFields(patch);
  const client = requireClient();
  const owner = requireUserId(userId);
  const row = await run<PantryItemRow>(
    client
      .from('pantry_items')
      .update({ ...pantryFieldsToColumns(patch), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', owner)
      .select(PANTRY_ITEM_COLUMNS)
      .single(),
  );
  return pantryItemFromRow(row);
}

/** Deletes one row and returns it as the server had it (for Undo). */
export async function deletePantryItem(
  userId: string | null | undefined,
  { id }: RemovePantryItemVars,
): Promise<PantryItem> {
  const client = requireClient();
  const owner = requireUserId(userId);
  const row = await run<PantryItemRow>(
    client.from('pantry_items').delete().eq('id', id).eq('user_id', owner).select(PANTRY_ITEM_COLUMNS).single(),
  );
  return pantryItemFromRow(row);
}

/** Puts a deleted row back with the same id and values. */
export async function restorePantryItem(
  userId: string | null | undefined,
  { row: item }: RestorePantryItemVars,
): Promise<PantryItem> {
  const client = requireClient();
  const owner = requireUserId(userId);
  if (item.userId !== owner) throw new DataError('forbidden', messages.forbidden);
  const row = await run<PantryItemRow>(
    client
      .from('pantry_items')
      .insert({
        id: item.id,
        user_id: owner,
        ingredient_id: item.ingredientId,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location,
        photo_url: item.photoUrl,
        expires_on: item.expiresOn,
        scan_photo_path: item.scanPhotoPath,
        updated_at: new Date().toISOString(),
      })
      .select(PANTRY_ITEM_COLUMNS)
      .single(),
  );
  return pantryItemFromRow(row);
}

// ----------------------------------------------------------------------- hooks

function usePantryScope() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return { queryClient, userId, queryKey: keys.pantry.list(userId) };
}

/**
 *   const add = useAddPantryItem();
 *   add.mutate(newPantryItemVars({ name, category, quantity, unit, location, expiresOn, ingredientId }));
 */
export function useAddPantryItem() {
  const { queryClient, userId, queryKey } = usePantryScope();
  return useMutation({
    mutationKey: pantryMutationKeys.add(),
    mutationFn: (vars: AddPantryItemVars) => insertPantryItem(userId, vars),
    ...listMutation<PantryItem, AddPantryItemVars, PantryItem>({
      queryClient,
      queryKey,
      // Refetch only once no pantry change of any kind is still running.
      mutationKey: mutationKeys.pantry.all,
      change: (vars) => {
        validatePantryFields(vars);
        return addItem(placeholderPantryItem(userId, vars));
      },
      applyResult: (list, row, vars) => replaceItem(list, row, vars.tempId),
      isOnline: isOnlineNow,
    }),
  });
}

export function useEditPantryItem() {
  const { queryClient, userId, queryKey } = usePantryScope();
  return useMutation({
    mutationKey: pantryMutationKeys.edit(),
    mutationFn: (vars: EditPantryItemVars) => editPantryItem(userId, vars),
    ...listMutation<PantryItem, EditPantryItemVars, PantryItem>({
      queryClient,
      queryKey,
      mutationKey: mutationKeys.pantry.all,
      change: ({ id, patch }) => {
        validatePantryFields(patch);
        return updateItem<PantryItem>(id, cleanPantryFields(patch));
      },
      isOnline: isOnlineNow,
    }),
  });
}

/** On success, `data` is the deleted row: pass it to useRestorePantryItem for Undo. */
export function useRemovePantryItem() {
  const { queryClient, userId, queryKey } = usePantryScope();
  return useMutation({
    mutationKey: pantryMutationKeys.remove(),
    mutationFn: (vars: RemovePantryItemVars) => deletePantryItem(userId, vars),
    ...listMutation<PantryItem, RemovePantryItemVars, PantryItem>({
      queryClient,
      queryKey,
      mutationKey: mutationKeys.pantry.all,
      change: ({ id }) => removeItem<PantryItem>(id),
      applyResult: (list, _row, { id }) => list.filter((item) => item.id !== id),
      isOnline: isOnlineNow,
    }),
  });
}

export function useRestorePantryItem() {
  const { queryClient, userId, queryKey } = usePantryScope();
  return useMutation({
    mutationKey: pantryMutationKeys.restore(),
    mutationFn: (vars: RestorePantryItemVars) => restorePantryItem(userId, vars),
    ...listMutation<PantryItem, RestorePantryItemVars, PantryItem>({
      queryClient,
      queryKey,
      mutationKey: mutationKeys.pantry.all,
      change: ({ row }) => restoreItem(row),
      isOnline: isOnlineNow,
    }),
  });
}
