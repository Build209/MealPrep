import type { StoreAction } from './delivery';

/**
 * The one button a store card leads with: the weekly ad, else Shop online. Everything else
 * (including the delivery links) is secondary. A store with neither gets no primary.
 */
export function splitActions(actions: readonly StoreAction[]): { primary?: StoreAction; secondary: StoreAction[] } {
  const primary = actions.find((a) => a.id === 'flyer') ?? actions.find((a) => a.id === 'shop');
  return { primary, secondary: actions.filter((a) => a !== primary) };
}

/** Saved stores pulled to the top, each group keeping its order (closest first). */
export function partitionSaved<T>(list: readonly T[], isSaved: (item: T) => boolean): { saved: T[]; rest: T[] } {
  const saved: T[] = [];
  const rest: T[] = [];
  for (const item of list) (isSaved(item) ? saved : rest).push(item);
  return { saved, rest };
}
