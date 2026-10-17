import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { currentUsagePeriod } from '../scan/allowance';
import { ingredientNames, type ShortlistRecipe } from '../forky/shortlist';
import { retryUnlessPermanent, run, toDataError } from './errors';
import { SIGNED_OUT } from './keys';
import { readAllPages } from './libraryPaging';
import { requireClient, requireUserId, useSessionUserId } from './session';

/**
 * Reads for Ask Forky. Read-only: only the live ask-forky function writes forky_chat_usage
 * (claim_forky_message / settle_forky_message), and the chat text is never stored anywhere.
 */

/** This month's Ask Forky messages used, from the person's own forky_chat_usage row. No row = 0. */
export async function fetchForkyMessagesUsed(userId: string | null | undefined, period: string): Promise<number> {
  const client = requireClient();
  const id = requireUserId(userId);
  let response: { data: unknown; error: unknown };
  try {
    response = await client.from('forky_chat_usage').select('messages').eq('user_id', id).eq('period', period).maybeSingle();
  } catch (thrown) {
    throw toDataError(thrown);
  }
  if (response.error) throw toDataError(response.error);
  const messages = (response.data as { messages?: unknown } | null)?.messages;
  return typeof messages === 'number' && Number.isFinite(messages) ? messages : 0;
}

export const forkyUsageKey = (userId: string | null | undefined, period: string) =>
  ['forky-usage', userId ? userId : SIGNED_OUT, period] as const;

export function useForkyMessagesUsed() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const period = currentUsagePeriod();
  return useQuery({
    queryKey: forkyUsageKey(userId, period),
    queryFn: () => fetchForkyMessagesUsed(userId, period),
    enabled: !session.isPending && userId !== null,
    retry: retryUnlessPermanent,
  });
}

/** After an answer or a refusal: read the count again (and the plans/usage screens' copy too). */
export function useRefreshForkyUsage() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['forky-usage'] });
    void queryClient.invalidateQueries({ queryKey: ['usage'] });
  }, [queryClient]);
}

/**
 * Recipes Forky may suggest: master recipes, the person's own, and published library recipes,
 * with route ids r_<uuid> / l_<uuid> and ingredient names only.
 */
export async function fetchForkyRecipes(userId: string | null | undefined): Promise<ShortlistRecipe[]> {
  const client = requireClient();
  const id = requireUserId(userId);
  const [own, library] = await Promise.all([
    run<{ id: string; name: string; ingredients: unknown }[]>(
      client.from('recipes').select('id, name, ingredients').or(`is_master.eq.true,created_by.eq.${id}`).order('created_at', { ascending: true }),
    ),
    readAllPages<{ id: string; title: string; ingredients: unknown }>((from, to) =>
      run<{ id: string; title: string; ingredients: unknown }[]>(
        client.from('library_recipes').select('id, title, ingredients').eq('status', 'published').order('id', { ascending: true }).range(from, to),
      ),
    ),
  ]);
  return [
    ...own.map((row) => ({ id: `r_${row.id}`, title: row.name, ingredients: ingredientNames(row.ingredients) })),
    ...library.map((row) => ({ id: `l_${row.id}`, title: row.title, ingredients: ingredientNames(row.ingredients) })),
  ];
}

export const forkyRecipesKey = (userId: string | null | undefined) => ['forky-recipes', userId ? userId : SIGNED_OUT] as const;

export function useForkyRecipes() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: forkyRecipesKey(userId),
    queryFn: () => fetchForkyRecipes(userId),
    enabled: !session.isPending && userId !== null,
    retry: retryUnlessPermanent,
    staleTime: 5 * 60_000,
  });
}
