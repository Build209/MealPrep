import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { offlineError, retryUnlessPermanent, run } from '../data/errors';
import { SIGNED_OUT } from '../data/keys';
import { isOnlineNow } from '../data/online';
import { requireClient, requireUserId, useSessionUserId } from '../data/session';
import { cleanPicks, gearFromRows, swapsFromRows, type GearItem, type GearSwap } from './gear';

/**
 * Kitchen gear, through public.equipment / equipment_swaps (shared reference data, read-only) and
 * the person's own rows in public.user_equipment plus profiles.equipment_set_at (null = never
 * answered, so nothing is filtered). Migration 20261020000000_utensils_equipment.sql.
 */

export const gearKeys = {
  catalog: ['gear', 'catalog'] as const,
  swaps: ['gear', 'swaps'] as const,
  own: (userId: string | null | undefined) => ['gear', userId ? userId : SIGNED_OUT, 'own'] as const,
} as const;

const HOUR = 60 * 60 * 1000;
export type OwnGear = { slugs: string[]; setAt: string | null };

export async function fetchGearCatalog(): Promise<GearItem[]> {
  const rows = await run<unknown[]>(requireClient().from('equipment').select('slug, name, category, sort_order').order('sort_order'));
  return gearFromRows(rows as never);
}

export async function fetchGearSwaps(): Promise<GearSwap[]> {
  const rows = await run<unknown[]>(requireClient().from('equipment_swaps').select('needs, can_use, quality, note'));
  return swapsFromRows(rows as never);
}

export async function fetchOwnGear(userId: string | null | undefined): Promise<OwnGear> {
  const client = requireClient();
  const id = requireUserId(userId);
  const rows = await run<{ equipment_slug: string }[]>(client.from('user_equipment').select('equipment_slug').eq('user_id', id).limit(100));
  const profile = await run<{ equipment_set_at: string | null }>(client.from('profiles').select('equipment_set_at').eq('id', id).single());
  return { slugs: rows.map((r) => r.equipment_slug), setAt: profile.equipment_set_at ?? null };
}

/** Saves the whole set: adds new picks, removes the rest, then marks the picker as answered. */
export async function saveOwnGear(userId: string | null | undefined, picks: readonly string[], catalog: readonly GearItem[]): Promise<OwnGear> {
  if (!isOnlineNow()) throw offlineError();
  const client = requireClient();
  const id = requireUserId(userId);
  const slugs = cleanPicks(picks, catalog);
  if (slugs.length > 0) {
    await run(client.from('user_equipment').upsert(slugs.map((s) => ({ user_id: id, equipment_slug: s, source: 'picked' })), { onConflict: 'user_id,equipment_slug' }));
  }
  const del = client.from('user_equipment').delete().eq('user_id', id);
  await run(slugs.length > 0 ? del.not('equipment_slug', 'in', `(${slugs.join(',')})`) : del);
  const setAt = new Date().toISOString();
  await run(client.from('profiles').update({ equipment_set_at: setAt }).eq('id', id));
  return { slugs, setAt };
}

export function useGearCatalog() {
  return useQuery({ queryKey: gearKeys.catalog, queryFn: fetchGearCatalog, staleTime: HOUR, retry: retryUnlessPermanent });
}

export function useGearSwaps() {
  return useQuery({ queryKey: gearKeys.swaps, queryFn: fetchGearSwaps, staleTime: HOUR, retry: retryUnlessPermanent });
}

/** The person's gear. `owned` is null until they have answered the picker (so callers do no filtering). */
export function useOwnGear() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const catalog = useGearCatalog();
  const query = useQuery({
    queryKey: gearKeys.own(userId),
    queryFn: () => fetchOwnGear(userId),
    enabled: !session.isPending && userId !== null,
    staleTime: 10 * 60 * 1000,
    retry: retryUnlessPermanent,
  });
  const mutation = useMutation({
    mutationKey: ['gear', 'save'],
    mutationFn: (picks: readonly string[]) => saveOwnGear(userId, picks, catalog.data ?? []),
    onSuccess: (saved) => queryClient.setQueryData(gearKeys.own(userId), saved),
  });
  const data = query.data;
  return {
    owned: data && data.setAt ? new Set(data.slugs) : null,
    slugs: data?.slugs ?? [],
    isLoading: session.isPending || query.isLoading,
    isError: query.isError,
    save: async (picks: readonly string[]) => {
      await mutation.mutateAsync(picks);
    },
    saving: mutation.isPending,
  };
}
