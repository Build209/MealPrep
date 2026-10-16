import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataError, messages, run, toDataError } from './errors';
import { keys, mutationKeys } from './keys';
import { addItem, removeItem, replaceItem, tempId, updateItem } from './listOps';
import { isOnlineNow } from './online';
import { listMutation } from './optimistic';
import {
  chunked,
  cleanPantryFields,
  pantryFieldsToColumns,
  pantryRestoreColumns,
  placeholderPantryItem,
  removeMany,
  restoreItem,
  restoreMany,
  validatePantryFields,
  type AddPantryItemVars,
  type ClearPantryItemsVars,
  type RestorePantryItemsVars,
  type EditPantryItemVars,
  type PantryItemFields,
  type RemovePantryItemVars,
  type RestorePantryItemVars,
} from './pantryFields';
import { PANTRY_ITEM_COLUMNS, pantryItemFromRow, type PantryItem, type PantryItemRow } from './rows';
import { requireClient, requireUserId, useSessionUserId } from './session';

export type {
  AddPantryItemVars,
  ClearPantryItemsVars,
  EditPantryItemVars,
  PantryItemFields,
  RemovePantryItemVars,
  RestorePantryItemVars,
  RestorePantryItemsVars,
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
  clear: () => ['pantry', 'clear'] as const,
  restoreMany: () => ['pantry', 'restore-many'] as const,
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
    client.from('pantry_items').insert(pantryRestoreColumns(owner, item)).select(PANTRY_ITEM_COLUMNS).single(),
  );
  return pantryItemFromRow(row);
}

/**
 * A clear that the server refused part-way through a very large pantry (more than
 * CLEAR_BATCH_SIZE items, so more than one request). `removed` is what the server did
 * delete, so the screen can still offer Undo for those rows.
 */
export class PartialClearError extends DataError {
  readonly removed: PantryItem[];
  constructor(cause: DataError, removed: PantryItem[]) {
    super(cause.kind, cause.message, { cause });
    this.name = 'PartialClearError';
    this.removed = removed;
  }
}

/**
 * Deletes the given rows (one request per CLEAR_BATCH_SIZE ids, so one request for any
 * normal pantry) and returns them as the server had them, for Undo. Filtered by owner as
 * well as by row level security. Ids the server no longer has are simply not returned.
 */
export async function deletePantryItems(
  userId: string | null | undefined,
  { ids }: ClearPantryItemsVars,
): Promise<PantryItem[]> {
  const client = requireClient();
  const owner = requireUserId(userId);
  const removed: PantryItem[] = [];
  for (const batch of chunked([...new Set(ids)])) {
    try {
      const rows = await run<PantryItemRow[]>(
        client.from('pantry_items').delete().eq('user_id', owner).in('id', batch).select(PANTRY_ITEM_COLUMNS),
      );
      removed.push(...rows.map(pantryItemFromRow));
    } catch (error) {
      const plain = toDataError(error);
      throw removed.length > 0 ? new PartialClearError(plain, removed) : plain;
    }
  }
  return removed;
}

/** Puts cleared rows back with the same ids and values, in one request. */
export async function restorePantryItems(
  userId: string | null | undefined,
  { rows: items }: RestorePantryItemsVars,
): Promise<PantryItem[]> {
  const client = requireClient();
  const owner = requireUserId(userId);
  if (items.length === 0) return [];
  if (items.some((item) => item.userId !== owner)) throw new DataError('forbidden', messages.forbidden);
  const now = new Date();
  const rows = await run<PantryItemRow[]>(
    client
      .from('pantry_items')
      .insert(items.map((item) => pantryRestoreColumns(owner, item, now)))
      .select(PANTRY_ITEM_COLUMNS),
  );
  return rows.map(pantryItemFromRow);
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

/**
 * Clear several rows (a whole place, or everything). The rows leave the screen at once and
 * come back if the server refuses. On success `data` is the deleted rows: pass them to
 * useRestorePantryItems for Undo. A PartialClearError carries the rows that did go.
 */
export function useClearPantryItems() {
  const { queryClient, userId, queryKey } = usePantryScope();
  return useMutation({
    mutationKey: pantryMutationKeys.clear(),
    mutationFn: (vars: ClearPantryItemsVars) => deletePantryItems(userId, vars),
    ...listMutation<PantryItem, ClearPantryItemsVars, PantryItem[]>({
      queryClient,
      queryKey,
      mutationKey: mutationKeys.pantry.all,
      change: ({ ids }) => removeMany<PantryItem>(ids),
      applyResult: (list, removed) => {
        const gone = new Set(removed.map((row) => row.id));
        return list.filter((item) => !gone.has(item.id));
      },
      isOnline: isOnlineNow,
    }),
  });
}

/** Undo of a clear: every removed row goes back through the server with the same id and values. */
export function useRestorePantryItems() {
  const { queryClient, userId, queryKey } = usePantryScope();
  return useMutation({
    mutationKey: pantryMutationKeys.restoreMany(),
    mutationFn: (vars: RestorePantryItemsVars) => restorePantryItems(userId, vars),
    ...listMutation<PantryItem, RestorePantryItemsVars, PantryItem[]>({
      queryClient,
      queryKey,
      mutationKey: mutationKeys.pantry.all,
      change: ({ rows }) => restoreMany<PantryItem>(rows),
      applyResult: (list, saved) => saved.reduce<PantryItem[]>((acc, row) => replaceItem(acc, row), [...list]),
      isOnline: isOnlineNow,
    }),
  });
}
