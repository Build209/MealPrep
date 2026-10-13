import type { MutationKey, QueryClient, QueryKey } from '@tanstack/react-query';
import { offlineError } from './errors';
import { replaceItem, rollback, type Identified, type ListChange } from './listOps';

/**
 * The one way the app changes a list on screen before the server answers.
 *
 *   onMutate   refuse if offline; stop in-flight refetches; snapshot; apply the change
 *   onError    roll back (exactly the snapshot, or only this change's rows if the
 *              list moved on in the meantime)
 *   onSuccess  put the server's returned row in place (temporary ids get replaced)
 *   onSettled  refetch, but only when no other change of the same kind is still
 *              running, so a refetch never overwrites an unanswered change
 *
 * Spread the result into useMutation({ mutationKey, mutationFn, ...listMutation(...) }).
 * There is no second copy of the data anywhere: the query cache is the screen's copy
 * of the server, and the server's answer always wins.
 */

export type ListMutationContext<T extends Identified> = {
  snapshot: readonly T[];
  applied: readonly T[];
  change: ListChange<T>;
};

export type ListMutationOptions<T extends Identified, TVars, TResult> = {
  queryClient: QueryClient;
  queryKey: QueryKey;
  mutationKey: MutationKey;
  /** The optimistic change for these variables. */
  change: (vars: TVars) => ListChange<T>;
  /**
   * How to put the server's answer into the list. Default: when the result is a row,
   * it replaces the row with the same id. Return the list unchanged to rely on the refetch.
   */
  applyResult?: (list: readonly T[], result: TResult, vars: TVars) => T[];
  /** Connection check; defaults to "online". Pass () => onlineManager.isOnline(). */
  isOnline?: () => boolean;
};

export function listMutation<T extends Identified, TVars, TResult>(options: ListMutationOptions<T, TVars, TResult>) {
  const { queryClient, queryKey, mutationKey, change, isOnline } = options;
  const applyResult: (list: readonly T[], result: TResult, vars: TVars) => T[] =
    options.applyResult ?? ((list, result) => defaultApplyResult<T, TResult>(list, result));

  return {
    onMutate: async (vars: TVars): Promise<ListMutationContext<T> | undefined> => {
      // Throwing here stops the mutation before anything changes on screen.
      if (isOnline && !isOnline()) throw offlineError();
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<T[]>(queryKey);
      if (!snapshot) return undefined; // nothing loaded yet: nothing to change optimistically
      const c = change(vars);
      queryClient.setQueryData<T[]>(queryKey, c.apply(snapshot));
      // Read it back: structural sharing may store a different array than the one passed in,
      // and rollback compares by identity to know whether anything else changed the list.
      const applied = queryClient.getQueryData<T[]>(queryKey) ?? c.apply(snapshot);
      return { snapshot, applied, change: c };
    },

    onError: (_error: unknown, _vars: TVars, context: ListMutationContext<T> | undefined): void => {
      if (!context) return;
      queryClient.setQueryData<T[]>(queryKey, (current) =>
        rollback(current, context.snapshot, context.applied, context.change),
      );
    },

    onSuccess: (result: TResult, vars: TVars): void => {
      queryClient.setQueryData<T[]>(queryKey, (current) => (current ? applyResult(current, result, vars) : current));
    },

    onSettled: async (): Promise<void> => {
      // This mutation still counts as running while its own onSettled runs.
      if (queryClient.isMutating({ mutationKey }) > 1) return;
      await queryClient.invalidateQueries({ queryKey });
    },
  };
}

function defaultApplyResult<T extends Identified, TResult>(list: readonly T[], result: TResult): T[] {
  if (result && typeof result === 'object' && typeof (result as unknown as Partial<Identified>).id === 'string') {
    return replaceItem(list, result as unknown as T);
  }
  return [...list];
}
