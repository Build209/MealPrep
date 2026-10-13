import { useMutation, useQueryClient } from '@tanstack/react-query';
import { planSave, type ReviewRow } from '../scan/review';
import { DataError, offlineError, run } from './errors';
import { keys } from './keys';
import { isOnlineNow } from './online';
import { fetchPantryItems, updatePantryQuantity } from './pantry';
import { PANTRY_ITEM_COLUMNS, pantryItemFromRow, type PantryItem, type PantryItemRow } from './rows';
import { requireClient, requireUserId, useSessionUserId } from './session';

export type ScanSaveResult = { added: PantryItem[]; toppedUp: PantryItem[] };

/**
 * Saves the rows a person kept on the scan review list (rule 3: the server's answer wins).
 *
 * 1. The pantry is read fresh from the server, so matching and receipt top-ups start from what
 *    the server holds now, not from a copy on the device.
 * 2. New rows go in one insert call; the rows the server created come back.
 * 3. Receipt lines that match an existing row with the same unit raise that row's quantity,
 *    one update per row; the server returns each saved row.
 * Then every pantry query is refetched (useSavePantryScan). Rows always belong to the signed-in
 * user. Not a transaction: if an update fails after the insert, the error is shown and the
 * refetch shows exactly what was saved.
 */
export async function savePantryScanRows(userId: string | null | undefined, rows: readonly ReviewRow[]): Promise<ScanSaveResult> {
  const owner = requireUserId(userId);
  if (!isOnlineNow()) throw offlineError();
  const pantry = await fetchPantryItems(owner);
  const plan = planSave(owner, rows, pantry);
  if (!plan.ok) throw new DataError('invalid', 'Fix the items marked below, or remove them, then save.');
  if (plan.inserts.length === 0 && plan.topUps.length === 0) {
    throw new DataError('invalid', 'Nothing to save. Keep at least one item.');
  }
  const client = requireClient();
  let added: PantryItem[] = [];
  if (plan.inserts.length > 0) {
    const payload = plan.inserts.map((row) => ({ ...row, user_id: owner }));
    const saved = await run<PantryItemRow[]>(client.from('pantry_items').insert(payload).select(PANTRY_ITEM_COLUMNS));
    added = saved.map(pantryItemFromRow);
  }
  const toppedUp: PantryItem[] = [];
  for (const topUp of plan.topUps) {
    toppedUp.push(await updatePantryQuantity(owner, { id: topUp.id, quantity: topUp.quantity }));
  }
  return { added, toppedUp };
}

/**
 *   const save = useSavePantryScan();
 *   save.mutate(rows, { onSuccess: ({ added, toppedUp }) => ... });
 */
export function useSavePantryScan() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useMutation({
    mutationKey: ['pantry', 'save-scan'] as const,
    mutationFn: (rows: readonly ReviewRow[]) => savePantryScanRows(userId, rows),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.pantry.all });
    },
  });
}
