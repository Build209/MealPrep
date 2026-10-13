import { useQuery } from '@tanstack/react-query';
import { retryUnlessPermanent, run } from './errors';
import { GROCERY_ITEM_COLUMNS, groceryItemFromRow, type GroceryItem, type GroceryItemRow } from './groceryRows';
import { SIGNED_OUT } from './keys';
import { requireClient, requireUserId, useSessionUserId } from './session';

export type { GroceryItem, GroceryOrigin, TickResult, UntickResult } from './groceryRows';

/**
 * The grocery list, read from the server. Same rules as the rest of the data layer
 * (src/data/README.md): the query cache is the screen's only copy, changes go through the
 * small mutations in groceryMutations.ts, and the server's answer wins.
 */

// ------------------------------------------------------------------------ keys

/** Query and mutation keys for grocery (kept here so keys.ts stays as it is during phase 2). */
export const groceryKeys = {
  all: ['grocery'] as const,
  list: (userId: string | null | undefined) => ['grocery', userId ? userId : SIGNED_OUT, 'list'] as const,
} as const;

export const groceryMutationKeys = {
  /** Every grocery change starts with this, so a refetch waits for all of them. */
  all: ['grocery'] as const,
  add: () => ['grocery', 'add'] as const,
  tick: () => ['grocery', 'tick'] as const,
  untick: () => ['grocery', 'untick'] as const,
  clearChecked: () => ['grocery', 'clear-checked'] as const,
  restore: () => ['grocery', 'restore'] as const,
} as const;

// ----------------------------------------------------------------------- reads

/** The signed-in person's grocery rows, ordered by name (id breaks ties so the order is stable). */
export async function fetchGroceryItems(userId: string | null | undefined): Promise<GroceryItem[]> {
  const client = requireClient();
  const id = requireUserId(userId);
  const rows = await run<GroceryItemRow[]>(
    client
      .from('grocery_list_items')
      .select(GROCERY_ITEM_COLUMNS)
      .eq('user_id', id)
      .order('name', { ascending: true })
      .order('id', { ascending: true }),
  );
  return rows.map(groceryItemFromRow);
}

export function useGroceryItems() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: groceryKeys.list(userId),
    queryFn: () => fetchGroceryItems(userId),
    enabled: !session.isPending,
    retry: retryUnlessPermanent,
  });
}
