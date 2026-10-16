import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toDataError, offlineError, retryUnlessPermanent } from '../data/errors';
import { isOnlineNow } from '../data/online';
import { SIGNED_OUT } from '../data/keys';
import { requireClient, requireUserId, useSessionUserId } from '../data/session';
import { EMPTY_PREFS, prefsFromRow, rowFromPrefs, type AllergenPrefs, type DietPrefsRow } from './prefsRows';
import type { AllergenKey } from './types';

/** Query key for the person's saved diet and allergen choices (public.user_diet_prefs). */
export const allergenPrefsKey = (userId: string | null | undefined) => ['allergens', userId ? userId : SIGNED_OUT, 'prefs'] as const;

const COLUMNS = 'user_id, diets, allergens';
/** One read per session is plenty: the only writer is this app, and save() updates the cache. */
const STALE_MS = 10 * 60 * 1000;

export async function fetchAllergenPrefs(userId: string | null | undefined): Promise<AllergenPrefs> {
  const client = requireClient();
  const id = requireUserId(userId);
  const { data, error } = await client.from('user_diet_prefs').select(COLUMNS).eq('user_id', id).maybeSingle();
  if (error) throw toDataError(error);
  return prefsFromRow(data as DietPrefsRow | null);
}

export async function saveAllergenPrefs(userId: string | null | undefined, next: AllergenPrefs): Promise<AllergenPrefs> {
  if (!isOnlineNow()) throw offlineError();
  const client = requireClient();
  const id = requireUserId(userId);
  const { data, error } = await client
    .from('user_diet_prefs')
    .upsert(rowFromPrefs(id, next), { onConflict: 'user_id' })
    .select(COLUMNS)
    .single();
  if (error) throw toDataError(error);
  return prefsFromRow(data as DietPrefsRow | null);
}

/**
 * The signed-in person's saved allergens and diets (public.user_diet_prefs; own row only).
 * No row, signed out, or a failed read all read as "none saved", so a feed never breaks on this.
 * `save` upserts the row and rejects with the usual offline error when there is no connection.
 */
export function useAllergenPrefs(): {
  allergens: AllergenKey[];
  diets: string[];
  isLoading: boolean;
  save: (next: { allergens: AllergenKey[]; diets: string[] }) => Promise<void>;
} {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const query = useQuery({
    queryKey: allergenPrefsKey(userId),
    queryFn: () => fetchAllergenPrefs(userId),
    enabled: !session.isPending && userId !== null,
    staleTime: STALE_MS,
    retry: retryUnlessPermanent,
  });
  const mutation = useMutation({
    mutationKey: ['allergens', 'save'],
    mutationFn: (next: AllergenPrefs) => saveAllergenPrefs(userId, next),
    onSuccess: (saved) => {
      queryClient.setQueryData(allergenPrefsKey(userId), saved);
    },
  });
  return {
    allergens: (query.data ?? EMPTY_PREFS).allergens,
    diets: (query.data ?? EMPTY_PREFS).diets,
    isLoading: session.isPending || query.isLoading,
    save: async (next) => {
      await mutation.mutateAsync({ allergens: next.allergens, diets: next.diets });
    },
  };
}
