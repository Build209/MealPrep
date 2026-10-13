import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataError, retryUnlessPermanent, run } from './errors';
import { keys, mutationKeys } from './keys';
import { updateItem } from './listOps';
import { isOnlineNow } from './online';
import { listMutation } from './optimistic';
import { PANTRY_ITEM_COLUMNS, pantryItemFromRow, type PantryItem, type PantryItemRow } from './rows';
import { requireClient, requireUserId, useSessionUserId } from './session';

// ----------------------------------------------------------------------- reads

/** The signed-in person's pantry, ordered by name (id breaks ties so the order is stable). */
export async function fetchPantryItems(userId: string | null | undefined): Promise<PantryItem[]> {
  const client = requireClient();
  const id = requireUserId(userId);
  // pantry_owner limits rows to the owner, but pantry_admin_read lets admins read every
  // pantry, so always filter by user_id.
  const rows = await run<PantryItemRow[]>(
    client
      .from('pantry_items')
      .select(PANTRY_ITEM_COLUMNS)
      .eq('user_id', id)
      .order('name', { ascending: true })
      .order('id', { ascending: true }),
  );
  return rows.map(pantryItemFromRow);
}

export function usePantryItems() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: keys.pantry.list(userId),
    queryFn: () => fetchPantryItems(userId),
    enabled: !session.isPending,
    retry: retryUnlessPermanent,
  });
}

// ---------------------------------------------------------------------- writes

export type UpdatePantryQuantityVars = { id: string; quantity: number };

export function validateQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new DataError('invalid', 'Quantity must be zero or more.');
  }
}

/** Sets one pantry row's quantity and returns the row the server saved. */
export async function updatePantryQuantity(
  userId: string | null | undefined,
  { id, quantity }: UpdatePantryQuantityVars,
): Promise<PantryItem> {
  validateQuantity(quantity);
  const client = requireClient();
  const owner = requireUserId(userId);
  const row = await run<PantryItemRow>(
    client
      .from('pantry_items')
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', owner)
      .select(PANTRY_ITEM_COLUMNS)
      .single(),
  );
  return pantryItemFromRow(row);
}

/**
 * Change a pantry item's quantity. The screen updates at once; if the server refuses
 * (or the device is offline) the old quantity comes back and `error.message` says why.
 *
 *   const update = useUpdatePantryQuantity();
 *   update.mutate({ id: item.id, quantity: item.quantity - 1 });
 */
export function useUpdatePantryQuantity() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const mutationKey = mutationKeys.pantry.updateQuantity();

  return useMutation({
    mutationKey,
    mutationFn: (vars: UpdatePantryQuantityVars) => updatePantryQuantity(userId, vars),
    ...listMutation<PantryItem, UpdatePantryQuantityVars, PantryItem>({
      queryClient,
      queryKey: keys.pantry.list(userId),
      mutationKey,
      change: ({ id, quantity }) => {
        validateQuantity(quantity); // refuse before anything changes on screen
        return updateItem<PantryItem>(id, { quantity });
      },
      isOnline: isOnlineNow,
    }),
  });
}
