import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NewPantryRow } from '../scan/review';
import { DataError, offlineError, run } from './errors';
import { keys } from './keys';
import { isOnlineNow } from './online';
import { PANTRY_ITEM_COLUMNS, pantryItemFromRow, type PantryItem, type PantryItemRow } from './rows';
import { requireClient, requireUserId, useSessionUserId } from './session';

/**
 * Saves the rows a person kept on the scan review list: one insert call, and the rows the
 * server created come back (rule 3: the server's answer wins). Then every pantry query is
 * refetched. Rows always belong to the signed-in user, whatever `user_id` they arrive with.
 */
export async function savePantryScanRows(userId: string | null | undefined, rows: readonly NewPantryRow[]): Promise<PantryItem[]> {
  const owner = requireUserId(userId);
  if (rows.length === 0) throw new DataError('invalid', 'Nothing to save. Keep at least one item.');
  if (!isOnlineNow()) throw offlineError();
  const client = requireClient();
  const payload = rows.map((row) => ({
    user_id: owner,
    ingredient_id: row.ingredient_id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit,
    location: row.location,
  }));
  const saved = await run<PantryItemRow[]>(client.from('pantry_items').insert(payload).select(PANTRY_ITEM_COLUMNS));
  return saved.map(pantryItemFromRow);
}

/**
 *   const save = useSavePantryScan();
 *   save.mutate(rows, { onSuccess: (items) => ... });
 */
export function useSavePantryScan() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useMutation({
    mutationKey: ['pantry', 'save-scan'] as const,
    mutationFn: (rows: readonly NewPantryRow[]) => savePantryScanRows(userId, rows),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.pantry.all });
    },
  });
}
