import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PurchaseDay, UsualSetting } from '../usuals/usualItems';
import { retryUnlessPermanent, run } from './errors';
import { SIGNED_OUT } from './keys';
import { requireClient, requireUserId, useSessionUserId } from './session';

/**
 * Usual items, read and changed through the person's own rows:
 *   purchase_history      days a grocery row was ticked as bought (written by a database trigger;
 *                         the app only reads it and can delete it)
 *   usual_item_settings   "hide" and "not now" choices
 * (db/supabase/migrations/20261020000000_usual_items.sql). Same rules as the rest of the data
 * layer (src/data/README.md): always filter by the owner, the query cache is the only copy.
 * Until that migration is on live, the reads fail with "table not found"; the card then shows
 * nothing (see useUsualsData).
 */

export const usualKeys = {
  all: ['usuals'] as const,
  purchases: (userId: string | null | undefined) => ['usuals', userId ? userId : SIGNED_OUT, 'purchases'] as const,
  settings: (userId: string | null | undefined) => ['usuals', userId ? userId : SIGNED_OUT, 'settings'] as const,
} as const;

type PurchaseRow = { name_key: string; name: string; bought_on: string };
type SettingRow = { name_key: string; hidden: boolean; snoozed_until: string | null };

export async function fetchPurchaseDays(userId: string | null | undefined): Promise<PurchaseDay[]> {
  const client = requireClient();
  const id = requireUserId(userId);
  const rows = await run<PurchaseRow[]>(
    client.from('purchase_history').select('name_key, name, bought_on').eq('user_id', id).order('bought_on', { ascending: false }).limit(400),
  );
  return rows.map((r) => ({ nameKey: r.name_key, name: r.name, boughtOn: r.bought_on }));
}

export async function fetchUsualSettings(userId: string | null | undefined): Promise<UsualSetting[]> {
  const client = requireClient();
  const id = requireUserId(userId);
  const rows = await run<SettingRow[]>(
    client.from('usual_item_settings').select('name_key, hidden, snoozed_until').eq('user_id', id).limit(500),
  );
  return rows.map((r) => ({ nameKey: r.name_key, hidden: r.hidden === true, snoozedUntil: r.snoozed_until }));
}

/** Both reads together, for the Grocery card. Errors (for example the tables not being there yet) leave `ready` false. */
export function useUsualsData() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const enabled = !session.isPending && !!userId;
  const purchases = useQuery({
    queryKey: usualKeys.purchases(userId),
    queryFn: () => fetchPurchaseDays(userId),
    enabled,
    retry: retryUnlessPermanent,
  });
  const settings = useQuery({
    queryKey: usualKeys.settings(userId),
    queryFn: () => fetchUsualSettings(userId),
    enabled,
    retry: retryUnlessPermanent,
  });
  return {
    ready: !!purchases.data && !!settings.data,
    purchases: purchases.data ?? [],
    settings: settings.data ?? [],
  };
}

export type SetUsualVars = { nameKey: string; hidden: boolean; snoozedUntil: string | null };

export function useSetUsualSetting() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useMutation({
    mutationKey: ['usuals', 'set'],
    mutationFn: async (vars: SetUsualVars) => {
      const client = requireClient();
      const id = requireUserId(userId);
      await run(
        client.from('usual_item_settings').upsert(
          { user_id: id, name_key: vars.nameKey, hidden: vars.hidden, snoozed_until: vars.snoozedUntil, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,name_key' },
        ),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: usualKeys.settings(userId) }),
  });
}

/** "Forget my usuals": deletes the person's own purchase days and choices. */
export function useForgetUsuals() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useMutation({
    mutationKey: ['usuals', 'forget'],
    mutationFn: async () => {
      const client = requireClient();
      const id = requireUserId(userId);
      await run(client.from('purchase_history').delete().eq('user_id', id));
      await run(client.from('usual_item_settings').delete().eq('user_id', id));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: usualKeys.all }),
  });
}
